const { buildCertificatePayload } = require("../services/certificate.service");
const DisabledRegistryProvider = require("../services/registry/disabledRegistryProvider");
const ManualRegistryProvider = require("../services/registry/manualRegistryProvider");
const DisabledPaymentProvider = require("../services/payment/disabledPaymentProvider");
const ManualInvoiceProvider = require("../services/payment/manualInvoiceProvider");
const CheckoutLockService = require("../services/checkoutLock.service");
const MarketplaceService = require("../services/marketplace.service");
const AuditService = require("../services/audit.service");
const { CarbonProject, MarketplaceBudget, MarketplaceBudgetRequest } = require("../models");

describe("marketplace final production blockers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("disabled registry provider never fabricates retirement references", async () => {
    const result = await new DisabledRegistryProvider().submitRetirement({});

    expect(result.status).toBe("manual_verification_required");
    expect(result.retirementId).toBeNull();
    expect(result.responseSnapshot.message).toMatch(/No registry provider/);
  });

  test("manual registry provider requires admin-entered verification outside provider", async () => {
    const result = await new ManualRegistryProvider().submitRetirement({});

    expect(result.status).toBe("manual_verification_required");
    expect(result.retirementId).toBeNull();
  });

  test("payment providers distinguish disabled and manual invoice workflows", async () => {
    await expect(new DisabledPaymentProvider().createInvoice({})).resolves.toEqual(expect.objectContaining({
      provider: "disabled",
      invoiceNumber: null,
    }));

    await expect(new ManualInvoiceProvider().createInvoice({ paymentReference: "PAY-1" })).resolves.toEqual(expect.objectContaining({
      provider: "manual_invoice",
      status: "invoice_sent",
      paymentReference: "PAY-1",
    }));
  });

  test("certificate payloads do not imply false retirement claims", () => {
    const demo = buildCertificatePayload({
      id: "tx-demo",
      isDemo: true,
      companyName: "Acme",
      projectName: "Demo",
      quantity: 1,
      status: "COMPLETED",
    });
    expect(demo.certificateType).toBe("demo");
    expect(demo.claimValidity).toBe("not_valid_for_real_offset_claims");

    const internal = buildCertificatePayload({
      id: "tx-internal",
      companyName: "Acme",
      projectName: "Internal",
      quantity: 1,
      status: "COMPLETED",
      registryRetirementStatus: "pending",
    });
    expect(internal.certificateType).toBe("internal_transaction");
    expect(internal.disclaimer).toMatch(/no registry retirement completed/i);

    const manual = buildCertificatePayload({
      id: "tx-manual",
      companyName: "Acme",
      projectName: "Manual",
      quantity: 1,
      status: "COMPLETED",
      registryProvider: "manual",
      registryRetirementStatus: "manually_verified",
      registryRetirementId: "REAL-RET-1",
    });
    expect(manual.certificateType).toBe("manual_registry_verified");
    expect(manual.claimValidity).toBe("valid_with_registry_reference");
    expect(manual.disclaimer).toBe("Registry retirement manually verified by admin.");
  });

  test("cannot create published real listing without registry evidence metadata", async () => {
    await expect(MarketplaceService.create({
      projectName: "Real Project",
      category: "Forestry",
      totalQuantityTco2e: 100,
      availableQuantityTco2e: 100,
      pricePerTco2e: 12,
      status: "PUBLISHED",
      isRealInventory: true,
    }, "company-1", { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });
  });

  test("demo listing cannot be marked real inventory", async () => {
    await expect(MarketplaceService.create({
      projectName: "Demo Project",
      category: "Forestry",
      totalQuantityTco2e: 100,
      availableQuantityTco2e: 100,
      pricePerTco2e: 0,
      isDemo: true,
      isRealInventory: true,
    }, "company-1", { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });
  });

  test("inventory adjustment requires reason and prevents negative inventory", async () => {
    jest.spyOn(MarketplaceService, "getProjectOrFail").mockResolvedValue({
      id: "project-1",
      companyId: "company-1",
      totalQuantityTco2e: 10,
      availableCredits: 10,
      reservedCredits: 0,
      retiredCredits: 0,
      status: "PUBLISHED",
    });

    await expect(MarketplaceService.adjustInventory("project-1", "company-1", {
      totalQuantityTco2e: 10,
      availableQuantityTco2e: -1,
      reason: "bad",
    }, { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });

    await expect(MarketplaceService.adjustInventory("project-1", "company-1", {
      totalQuantityTco2e: 10,
      availableQuantityTco2e: 5,
    }, { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });
  });

  test("manual registry verification requires evidence and blocks demo transactions", async () => {
    jest.spyOn(MarketplaceService, "getTransactionOrFail").mockResolvedValueOnce({
      id: "tx-demo",
      isDemo: true,
    });

    await expect(MarketplaceService.manualRetirement("tx-demo", "company-1", {
      registryRetirementId: "RET-1",
      registryRetirementUrl: "https://registry.example/retirements/1",
    }, { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });

    jest.spyOn(MarketplaceService, "getTransactionOrFail").mockResolvedValueOnce({
      id: "tx-real",
      isDemo: false,
    });

    await expect(MarketplaceService.manualRetirement("tx-real", "company-1", {
      registryRetirementId: "RET-1",
    }, { id: "admin-1", role: "ADMIN" })).rejects.toMatchObject({ statusCode: 422 });
  });

  test("manual payment verification requires reference or failure reason", async () => {
    jest.spyOn(MarketplaceService, "getTransactionOrFail").mockResolvedValue({
      id: "tx-1",
      paymentReference: null,
      registryRetirementStatus: "pending",
      save: jest.fn().mockResolvedValue(undefined),
    });

    await expect(MarketplaceService.markPaid("tx-1", "company-1", {}, { id: "admin-1", role: "ADMIN" }))
      .rejects.toMatchObject({ statusCode: 422 });

    await expect(MarketplaceService.markPaymentFailed("tx-1", "company-1", {}, { id: "admin-1", role: "ADMIN" }))
      .rejects.toMatchObject({ statusCode: 422 });
  });

  test("checkout lock uses atomic availability condition to prevent oversell", async () => {
    const findOneAndUpdate = jest.spyOn(CarbonProject, "findOneAndUpdate").mockReturnValue({
      session: jest.fn().mockResolvedValue(null),
    });
    jest.spyOn(CarbonProject, "findOne").mockReturnValue({
      session: jest.fn().mockResolvedValue({ id: "project-1", status: "PUBLISHED" }),
    });

    await expect(CheckoutLockService.lockCredits("project-1", 2, "user-1", "company-1", "tx-1", { session: {} }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({
      availableCredits: { $gte: 2 },
      $expr: expect.objectContaining({ $gte: expect.any(Array) }),
    }), expect.objectContaining({
      $inc: { reservedCredits: 2 },
    }), expect.objectContaining({ new: true }));
  });

  test("budget approval updates budget and audits decision", async () => {
    const requestDoc = {
      id: "request-1",
      requestedAmount: 50000,
      requestedBy: "manager-1",
      status: "PENDING",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(MarketplaceBudgetRequest, "findOne")
      .mockImplementationOnce(() => Promise.resolve(requestDoc))
      .mockImplementationOnce(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: "request-1",
          companyId: "company-1",
          requestedAmount: 50000,
          currentBudget: 25000,
          status: "APPROVED",
        }),
      }));
    jest.spyOn(MarketplaceBudget, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue({ totalBudget: 25000 }),
    });
    jest.spyOn(MarketplaceBudget, "findOneAndUpdate").mockResolvedValue({
      id: "budget-1",
      toJSON: () => ({ totalBudget: 50000 }),
    });
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await MarketplaceService.approveBudgetRequest(
      "request-1",
      "company-1",
      { id: "admin-1", role: "ADMIN", email: "admin@example.com" },
      { reason: "Approved" },
    );

    expect(result.status).toBe("approved");
    expect(MarketplaceBudget.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-1" }), expect.objectContaining({
      $set: expect.objectContaining({ totalBudget: 50000 }),
    }), expect.objectContaining({ upsert: true }));
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "budget_increase_approved" }));
  });

  test("budget rejection stores reason and audits decision", async () => {
    const requestDoc = {
      id: "request-2",
      requestedAmount: 75000,
      status: "PENDING",
      save: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(MarketplaceBudgetRequest, "findOne")
      .mockImplementationOnce(() => Promise.resolve(requestDoc))
      .mockImplementationOnce(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: "request-2",
          companyId: "company-1",
          requestedAmount: 75000,
          currentBudget: 25000,
          status: "REJECTED",
          reviewReason: "Insufficient justification",
        }),
      }));
    const auditSpy = jest.spyOn(AuditService, "log").mockResolvedValue({});

    const result = await MarketplaceService.rejectBudgetRequest(
      "request-2",
      "company-1",
      { id: "admin-1", role: "ADMIN", email: "admin@example.com" },
      { reason: "Insufficient justification" },
    );

    expect(result.status).toBe("rejected");
    expect(requestDoc.reviewReason).toBe("Insufficient justification");
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ action: "budget_increase_rejected" }));
  });
});
