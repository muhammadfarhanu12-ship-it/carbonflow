const bcrypt = require("bcryptjs");
const env = require("../config/env");
const {
  Admin,
  Company,
  User,
  Supplier,
  Shipment,
  LedgerEntry,
  CarbonProject,
  Report,
  Setting,
  EmissionFactor,
  Invoice,
  PlatformSetting,
  AuditLog,
} = require("../models");
const { calculateShipmentEmissions, calculateCarbonCost } = require("../utils/calculations");

async function ensureSeedAdmin() {
  const existingAdmin = await Admin.findOne({ email: env.admin.bootstrapEmail });
  if (existingAdmin) {
    return;
  }

  await Admin.create({
    name: "Platform Admin",
    email: env.admin.bootstrapEmail,
    passwordHash: await bcrypt.hash(env.admin.bootstrapPassword, env.auth.bcryptSaltRounds),
    role: "superadmin",
    status: "active",
  });
}

async function seedDatabase() {
  await ensureSeedAdmin();

  const count = await Company.countDocuments();
  if (count > 0) return;

  const company = await Company.create({
    name: "Acme Logistics Corp",
    industry: "Global Supply Chain",
    headquarters: "New York, USA",
    carbonTargetYear: 2040,
    carbonPricePerTon: env.carbonPricePerTon,
    apiKey: "cf_demo_key",
    planType: "ENTERPRISE",
    status: "ACTIVE",
  });

  await Setting.create({
    companyId: company.id,
    companyName: company.name,
    industry: company.industry,
    carbonPricePerTon: env.carbonPricePerTon,
    netZeroTargetYear: company.carbonTargetYear,
    integrations: [
      { name: "SAP S/4HANA", status: "CONNECTED", lastSync: "2 hours ago" },
      { name: "Manhattan Active TMS", status: "NOT_CONNECTED", lastSync: null },
    ],
    apiKeys: [{ label: "Default API Key", key: "cf_demo_key", createdAt: new Date().toISOString() }],
  });

  await User.create({
    companyId: company.id,
    name: "Demo User",
    email: "user@carbonflow.io",
    password: await bcrypt.hash("password123", 10),
    role: "USER",
    status: "ACTIVE",
    isVerified: true,
  });

  const suppliers = await Supplier.bulkCreate([
    {
      companyId: company.id,
      name: "Global Logistics Inc.",
      contactEmail: "ops@globallogistics.com",
      region: "North America",
      category: "Ocean Freight",
      verificationStatus: "VERIFIED",
      onTimeDeliveryRate: 97,
      renewableRatio: 0.48,
      complianceFlags: 0,
      totalEmissions: 12500,
      carbonScore: 88,
      riskScore: 18,
      riskLevel: "LOW",
      invitationStatus: "ACCEPTED",
    },
    {
      companyId: company.id,
      name: "Pacific Shipping",
      contactEmail: "contact@pacificshipping.io",
      region: "APAC",
      category: "Ocean Freight",
      verificationStatus: "ACTION_REQUIRED",
      onTimeDeliveryRate: 82,
      renewableRatio: 0.12,
      complianceFlags: 2,
      totalEmissions: 22100,
      carbonScore: 52,
      riskScore: 74,
      riskLevel: "HIGH",
      invitationStatus: "SENT",
    },
    {
      companyId: company.id,
      name: "EcoTransport Ltd.",
      contactEmail: "hello@ecotransport.com",
      region: "Europe",
      category: "Road Freight",
      verificationStatus: "VERIFIED",
      onTimeDeliveryRate: 96,
      renewableRatio: 0.65,
      complianceFlags: 0,
      totalEmissions: 3200,
      carbonScore: 94,
      riskScore: 9,
      riskLevel: "LOW",
      invitationStatus: "ACCEPTED",
    },
  ]);

  const shipmentsSeed = [
    {
      supplierId: suppliers[0].id,
      reference: "SHP-1042",
      origin: "Shanghai, CN",
      destination: "Los Angeles, US",
      distanceKm: 10400,
      transportMode: "OCEAN",
      carrier: "Maersk",
      vehicleType: "Container Vessel",
      fuelType: "Marine Fuel",
      weightKg: 24500,
      costUsd: 4500,
      status: "IN_TRANSIT",
    },
    {
      supplierId: suppliers[1].id,
      reference: "SHP-1043",
      origin: "Hamburg, DE",
      destination: "Chicago, US",
      distanceKm: 7200,
      transportMode: "AIR",
      carrier: "DHL Aviation",
      vehicleType: "Cargo Aircraft",
      fuelType: "Jet Fuel",
      weightKg: 3400,
      costUsd: 12000,
      status: "DELAYED",
    },
    {
      supplierId: suppliers[2].id,
      reference: "SHP-1044",
      origin: "Rotterdam, NL",
      destination: "Paris, FR",
      distanceKm: 430,
      transportMode: "ROAD",
      carrier: "DB Schenker",
      vehicleType: "EV Truck",
      fuelType: "Electric",
      weightKg: 12000,
      costUsd: 2100,
      status: "DELIVERED",
    },
  ];

  const shipments = [];
  for (const item of shipmentsSeed) {
    const emissionsTonnes = calculateShipmentEmissions(item);
    shipments.push(await Shipment.create({
      ...item,
      companyId: company.id,
      carbonPricePerTon: env.carbonPricePerTon,
      emissionsTonnes,
      carbonCostUsd: calculateCarbonCost(emissionsTonnes, env.carbonPricePerTon),
    }));
  }

  await LedgerEntry.bulkCreate(shipments.map((shipment) => ({
    companyId: company.id,
    shipmentId: shipment.id,
    entryDate: new Date().toISOString().slice(0, 10),
    category: "FREIGHT",
    description: `Ledger entry for ${shipment.reference}`,
    logisticsCostUsd: shipment.costUsd,
    emissionsTonnes: shipment.emissionsTonnes,
    carbonTaxUsd: calculateCarbonCost(shipment.emissionsTonnes, env.carbonPricePerTon),
    carbonCostUsd: calculateCarbonCost(shipment.emissionsTonnes, env.carbonPricePerTon),
    totalCostUsd: shipment.costUsd + calculateCarbonCost(shipment.emissionsTonnes, env.carbonPricePerTon),
  })));

  await CarbonProject.bulkCreate([
    {
      companyId: company.id,
      name: "Amazon Rainforest Conservation",
      type: "Forestry",
      location: "Brazil",
      certification: "Gold Standard",
      rating: 4.9,
      pricePerCreditUsd: 15.5,
      availableCredits: 45000,
      retiredCredits: 2500,
      status: "ACTIVE",
    },
    {
      companyId: company.id,
      name: "Wind Farm Development",
      type: "Renewable Energy",
      location: "India",
      certification: "VCS",
      rating: 4.7,
      pricePerCreditUsd: 8.2,
      availableCredits: 120000,
      retiredCredits: 900,
      status: "ACTIVE",
    },
  ]);

  await Report.bulkCreate([
    {
      companyId: company.id,
      name: "Q1 2026 ESG Summary",
      type: "ESG",
      format: "PDF",
      generatedAt: new Date(),
      status: "READY",
      downloadUrl: "/api/reports/download/q1-esg.pdf",
      metadata: { period: "Q1 2026" },
    },
    {
      companyId: company.id,
      name: "Annual Scope 1-3 Export",
      type: "COMPLIANCE",
      format: "CSV",
      generatedAt: new Date(),
      status: "READY",
      downloadUrl: "/api/reports/download/annual-scope.csv",
      metadata: { year: 2026 },
    },
  ]);

  await EmissionFactor.bulkCreate([
    {
      name: "Ocean Freight Average",
      category: "Shipping",
      value: 0.012,
      unit: "tCO2e/ton-km",
      source: "DEFRA 2026",
    },
    {
      name: "Air Freight Long Haul",
      category: "Aviation",
      value: 0.602,
      unit: "tCO2e/ton-km",
      source: "ICAO 2026",
    },
    {
      name: "Electric Truck",
      category: "Road",
      value: 0.004,
      unit: "tCO2e/ton-km",
      source: "EPA 2026",
    },
  ]);

  await Invoice.bulkCreate([
    {
      companyId: company.id,
      invoiceNumber: "INV-202604-1001",
      amountUsd: 12500,
      currency: "USD",
      status: "PAID",
      issuedAt: new Date("2026-03-01T00:00:00.000Z"),
      dueAt: new Date("2026-03-15T00:00:00.000Z"),
      paidAt: new Date("2026-03-12T00:00:00.000Z"),
      lineItems: [
        {
          description: "Enterprise subscription",
          quantity: 1,
          unitPriceUsd: 12500,
          totalUsd: 12500,
        },
      ],
    },
    {
      companyId: company.id,
      invoiceNumber: "INV-202604-1002",
      amountUsd: 8400,
      currency: "USD",
      status: "ISSUED",
      issuedAt: new Date("2026-04-01T00:00:00.000Z"),
      dueAt: new Date("2026-04-15T00:00:00.000Z"),
      lineItems: [
        {
          description: "Marketplace offset purchases",
          quantity: 1,
          unitPriceUsd: 8400,
          totalUsd: 8400,
        },
      ],
    },
  ]);

  await PlatformSetting.create({
    platformName: "CarbonFlow",
    supportEmail: "support@carbonflow.com",
    sessionTimeoutMinutes: 60,
    maintenanceMode: false,
    allowSelfSignup: true,
  });

  await AuditLog.bulkCreate([
    {
      action: "ADMIN_LOGIN",
      details: {
        description: "Platform administrator signed in successfully",
      },
    },
    {
      action: "REPORT_GENERATED",
      details: {
        description: "Q1 2026 ESG Summary report generated",
      },
    },
  ]);
}

module.exports = { seedDatabase };
