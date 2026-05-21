const mockEvidenceCreate = jest.fn();
const mockEvidenceFindOne = jest.fn();
const mockStorageUpload = jest.fn();
const mockStorageGetFile = jest.fn();

jest.mock("../models", () => ({
  SupplierEvidence: {
    create: (...args) => mockEvidenceCreate(...args),
    findOne: (...args) => mockEvidenceFindOne(...args),
  },
}));

jest.mock("../services/storage/evidenceStorage.service", () => ({
  buildStorageKey: () => "company-1/supplier-1/test-ghg.pdf",
  getEvidenceStorageAdapter: () => ({
    upload: (...args) => mockStorageUpload(...args),
    getFile: (...args) => mockStorageGetFile(...args),
  }),
}));

const { SupplierEvidenceService } = require("../services/supplierEvidence.service");
const { isAllowedEvidenceFile, MAX_EVIDENCE_FILE_SIZE_BYTES } = require("../middlewares/evidenceUpload");

describe("supplier evidence file upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageUpload.mockResolvedValue({
      storageKey: "company-1/supplier-1/test-ghg.pdf",
      fileUrl: null,
    });
    mockEvidenceCreate.mockImplementation(async (payload) => ({
      id: "evidence-1",
      toJSON: () => ({ id: "evidence-1", ...payload }),
      ...payload,
    }));
  });

  test("creates evidence record for a valid upload", async () => {
    const evidence = await SupplierEvidenceService.uploadFile({
      id: "supplier-1",
      companyId: "company-1",
    }, {
      originalname: "test-ghg.pdf",
      mimetype: "application/pdf",
      size: 1024,
      buffer: Buffer.from("file"),
    }, {
      evidenceType: "ghg_inventory",
      expiresAt: "2026-12-31",
    }, {
      id: "user-1",
    }, "app");

    expect(evidence.fileName).toBe("test-ghg.pdf");
    expect(evidence.storageKey).toBe("company-1/supplier-1/test-ghg.pdf");
    expect(evidence.uploadedBy).toBe("user-1");
    expect(evidence.uploadedVia).toBe("app");
    expect(evidence.virusScanStatus).toBe("not_scanned");
    expect(mockStorageUpload).toHaveBeenCalledWith(expect.objectContaining({
      key: "company-1/supplier-1/test-ghg.pdf",
      contentType: "application/pdf",
    }));
  });

  test("validates allowed and blocked file types", () => {
    expect(isAllowedEvidenceFile({ originalname: "report.pdf", mimetype: "application/pdf" })).toBe(true);
    expect(isAllowedEvidenceFile({ originalname: "script.exe", mimetype: "application/x-msdownload" })).toBe(false);
  });

  test("documents max evidence file size limit", () => {
    expect(MAX_EVIDENCE_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  test("scopes download lookup by supplier and company", async () => {
    const evidence = {
      id: "evidence-1",
      storageKey: "company-1/supplier-1/test-ghg.pdf",
      fileName: "test-ghg.pdf",
      mimeType: "application/pdf",
    };
    mockEvidenceFindOne.mockResolvedValue(evidence);
    mockStorageGetFile.mockResolvedValue({ stream: "stream" });

    const download = await SupplierEvidenceService.getDownload("supplier-1", "evidence-1", "company-1");

    expect(mockEvidenceFindOne).toHaveBeenCalledWith({
      _id: "evidence-1",
      supplierId: "supplier-1",
      companyId: "company-1",
    });
    expect(download.fileName).toBe("test-ghg.pdf");
  });
});
