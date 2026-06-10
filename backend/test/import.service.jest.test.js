const mockSupplierModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
};

jest.mock("../models", () => ({
  Shipment: {},
  Supplier: mockSupplierModel,
}));

jest.mock("../services/settings.service", () => ({
  getByCompanyId: jest.fn().mockResolvedValue({
    carbonPricePerTon: 55,
  }),
}));

jest.mock("../services/shipment.service", () => ({
  importRows: jest.fn(),
}));

const ImportService = require("../services/import.service");
const ShipmentService = require("../services/shipment.service");

describe("ImportService shipment workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupplierModel.find.mockResolvedValue([]);
    mockSupplierModel.findOne.mockResolvedValue(null);
    mockSupplierModel.create.mockResolvedValue({
      id: "supplier-import-1",
      name: "Bulk Import Supplier",
      category: "Logistics",
      country: "Unknown",
      region: "Global",
      riskLevel: "LOW",
    });
    ShipmentService.importRows.mockResolvedValue({
      summary: { successful: 1, inserted: 1, updated: 0 },
      errors: [],
      createdRecords: [{ id: "shipment-1", type: "shipment", reference: "SHP-1" }],
    });
  });

  test("does not save invalid import rows", async () => {
    const result = await ImportService.importShipments({
      shipments: [
        {
          rowIndex: 2,
          shipmentReference: "SHP-1",
          origin: "Karachi",
          destination: "Rotterdam",
          weightKg: 1000,
          distanceKm: 100,
          transportMode: "ROAD",
          carrier: "DHL",
          shipmentDate: "2026-06-01",
        },
        {
          rowIndex: 3,
          shipmentReference: "SHP-2",
          origin: "Karachi",
          destination: "",
          weightKg: 0,
          distanceKm: 0,
          transportMode: "ROAD",
          carrier: "DHL",
          shipmentDate: "2026-06-01",
        },
      ],
      metadata: { source: "csv", totalRows: 2, fileName: "shipments.csv", uploadId: "upload-1" },
    }, "company-1", { id: "user-1", email: "ops@example.com" });

    expect(ShipmentService.importRows).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          shipmentReference: "SHP-1",
        }),
      ]),
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ uploadId: "upload-1" }),
    );
    expect(ShipmentService.importRows).toHaveBeenCalledTimes(1);
    expect(result.summary.successful).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.errors.some((error) => error.rowIndex === 3)).toBe(true);
  });

  test("blocks cross-company supplier ids during import", async () => {
    ShipmentService.importRows.mockResolvedValueOnce({
      summary: { successful: 0, inserted: 0, updated: 0 },
      errors: [],
      createdRecords: [],
    });

    const result = await ImportService.importShipments({
      shipments: [
        {
          rowIndex: 2,
          shipmentReference: "SHP-1",
          origin: "Karachi",
          destination: "Rotterdam",
          weightKg: 1000,
          distanceKm: 100,
          transportMode: "ROAD",
          carrier: "DHL",
          shipmentDate: "2026-06-01",
          linkedSupplierId: "11111111-1111-4111-8111-111111111111",
        },
      ],
      metadata: { source: "csv", totalRows: 1, fileName: "shipments.csv", uploadId: "upload-2" },
    }, "company-1", { id: "user-1", email: "ops@example.com" });

    expect(ShipmentService.importRows).toHaveBeenCalledWith(
      [],
      "company-1",
      55,
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ uploadId: "upload-2" }),
    );
    expect(result.summary.successful).toBe(0);
    expect(result.summary.failed).toBe(1);
    expect(result.errors[0].message).toMatch(/supplier not found/i);
  });
});
