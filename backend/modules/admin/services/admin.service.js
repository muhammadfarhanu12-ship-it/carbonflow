const {
  Admin,
  AuditLog,
  Company,
  Emission,
  EmissionFactor,
  PlatformSetting,
  Report,
  Shipment,
  User,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { getPagination, formatPaginatedResponse } = require("../../../utils/pagination");
const { buildSearchFilter } = require("../../../models/helpers/model.utils");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SETTINGS_FACTOR_MAP = {
  road: { category: "Road", name: "Road Freight Average" },
  air: { category: "Aviation", name: "Air Freight Long Haul" },
  ocean: { category: "Shipping", name: "Ocean Freight Average" },
};

function toSafeUser(user) {
  const company = user.company ? {
    id: user.company.id,
    name: user.company.name,
    planType: user.company.planType,
    status: user.company.status,
  } : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    companyId: user.companyId || null,
    company,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toScopeLabel(scope) {
  if (scope === 1 || scope === "1") {
    return "Scope 1";
  }

  if (scope === 2 || scope === "2") {
    return "Scope 2";
  }

  if (scope === 3 || scope === "3") {
    return "Scope 3";
  }

  return "Unassigned";
}

function toStatusBadge(status) {
  switch (status) {
    case "DELIVERED":
      return "Verified";
    case "DELAYED":
      return "Flagged";
    default:
      return "Pending";
  }
}

function buildMonthBuckets(months = 6) {
  const now = new Date();
  const buckets = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    buckets.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: MONTH_NAMES[date.getMonth()],
      start: date,
    });
  }

  return buckets;
}

async function mapCompanies(companyIds) {
  const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];
  if (uniqueCompanyIds.length === 0) {
    return {};
  }

  const companies = await Company.find({ _id: { $in: uniqueCompanyIds } });

  return companies.reduce((accumulator, company) => {
    accumulator[company.id] = company;
    return accumulator;
  }, {});
}

async function logAdminAction(admin, action, details = {}) {
  try {
    await AuditLog.create({
      action,
      details: {
        ...details,
        actorType: "admin",
        actorId: admin?.id || null,
        actorEmail: admin?.email || null,
      },
    });
  } catch (_error) {
    // Audit logging is best effort for admin workflows.
  }
}

async function ensurePlatformSettings() {
  const existingSettings = await PlatformSetting.findOne();
  if (existingSettings) {
    return existingSettings;
  }

  return PlatformSetting.create({
    platformName: "CarbonFlow",
    supportEmail: "support@carbonflow.com",
    sessionTimeoutMinutes: 60,
    maintenanceMode: false,
    allowSelfSignup: true,
  });
}

async function getMonthlyShipmentMetrics(months = 6) {
  const buckets = buildMonthBuckets(months);
  const firstMonth = buckets[0]?.start;

  const rows = await Shipment.aggregate([
    {
      $match: firstMonth ? { createdAt: { $gte: firstMonth } } : {},
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        emissionsTonnes: { $sum: "$emissionsTonnes" },
        shipments: { $sum: 1 },
      },
    },
  ]);

  const rowMap = rows.reduce((accumulator, row) => {
    accumulator[`${row._id.year}-${row._id.month}`] = row;
    return accumulator;
  }, {});

  return buckets.map((bucket) => {
    const row = rowMap[`${bucket.year}-${bucket.month}`];

    return {
      name: bucket.label,
      emissionsTonnes: Number(row?.emissionsTonnes || 0),
      shipments: Number(row?.shipments || 0),
    };
  });
}

function normalizeAuditLog(log) {
  return {
    id: log.id,
    action: log.action,
    description: log.details?.description || log.action,
    actor: log.details?.actorEmail || "System",
    createdAt: log.createdAt,
  };
}

function normalizeReport(report, companyMap) {
  const company = companyMap[report.companyId];

  return {
    id: report.id,
    companyId: report.companyId,
    companyName: company?.name || "Unknown company",
    name: report.name,
    type: report.type,
    format: report.format,
    status: report.status,
    generatedAt: report.generatedAt,
    downloadUrl: report.downloadUrl,
    metadata: report.metadata || {},
  };
}

class AdminService {
  static async getDashboardData() {
    const [
      totalUsers,
      totalCompanies,
      totalShipments,
      totalAdmins,
      totalReports,
      pendingReports,
      shipmentTotals,
      recentActivity,
      monthlyEmissions,
    ] = await Promise.all([
      User.countDocuments(),
      Company.countDocuments(),
      Shipment.countDocuments(),
      Admin.countDocuments(),
      Report.countDocuments(),
      Report.countDocuments({ status: "PROCESSING" }),
      Shipment.aggregate([
        {
          $group: {
            _id: null,
            totalCarbonTonnes: { $sum: "$emissionsTonnes" },
          },
        },
      ]),
      AuditLog.find().sort({ createdAt: -1 }).limit(6),
      getMonthlyShipmentMetrics(6),
    ]);

    return {
      stats: {
        totalUsers,
        totalCompanies,
        totalShipments,
        totalAdmins,
        totalReports,
        pendingReports,
        totalCarbonTonnes: Number(shipmentTotals[0]?.totalCarbonTonnes || 0),
      },
      monthlyEmissions: monthlyEmissions.map((item) => ({
        name: item.name,
        value: item.emissionsTonnes,
      })),
      recentActivity: recentActivity.map(normalizeAuditLog),
    };
  }

  static async listUsers(query = {}) {
    const { page, pageSize, offset, limit } = getPagination(query);
    const filter = {
      ...buildSearchFilter(["name", "email"], query.search),
    };

    if (query.status) {
      filter.status = String(query.status).toUpperCase();
    }

    const [count, rows] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).populate("company"),
    ]);

    return formatPaginatedResponse({
      rows: rows.map(toSafeUser),
      count,
      page,
      pageSize,
    });
  }

  static async updateUserStatus(userId, status, admin) {
    const user = await User.findById(userId).populate("company");
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    user.status = String(status).toUpperCase();
    await user.save();

    await logAdminAction(admin, "ADMIN_USER_STATUS_UPDATED", {
      description: `${admin.email} updated ${user.email} to ${user.status}`,
      targetUserId: user.id,
      targetUserEmail: user.email,
    });

    return toSafeUser(user);
  }

  static async deleteUser(userId, admin) {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    await user.deleteOne();

    await logAdminAction(admin, "ADMIN_USER_DELETED", {
      description: `${admin.email} deleted ${user.email}`,
      targetUserId: user.id,
      targetUserEmail: user.email,
    });

    return { id: userId };
  }

  static async getAnalytics(query = {}) {
    const months = Math.max(Math.min(Number(query.months || 6), 24), 3);

    const [
      categoryTotals,
      scopeTotals,
      shipmentTotals,
      monthlyMetrics,
      shipmentCount,
    ] = await Promise.all([
      Shipment.aggregate([
        {
          $group: {
            _id: "$transportMode",
            value: { $sum: "$emissionsTonnes" },
          },
        },
        { $sort: { value: -1 } },
      ]),
      Emission.aggregate([
        {
          $group: {
            _id: "$scope",
            value: { $sum: "$value" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Shipment.aggregate([
        {
          $group: {
            _id: null,
            totalEmissionsTonnes: { $sum: "$emissionsTonnes" },
          },
        },
      ]),
      getMonthlyShipmentMetrics(months),
      Shipment.countDocuments(),
    ]);

    const totalEmissionsTonnes = Number(shipmentTotals[0]?.totalEmissionsTonnes || 0);

    const scopeBreakdown = scopeTotals.length > 0
      ? scopeTotals.map((item) => ({
        name: toScopeLabel(item._id),
        value: Number(item.value || 0),
      }))
      : [
        { name: "Scope 1", value: 0 },
        { name: "Scope 2", value: 0 },
        { name: "Scope 3", value: totalEmissionsTonnes },
      ];

    return {
      summary: {
        totalEmissionsTonnes,
        averageShipmentEmissionTonnes: shipmentCount > 0 ? Number((totalEmissionsTonnes / shipmentCount).toFixed(2)) : 0,
      },
      emissionsByCategory: categoryTotals.map((item) => ({
        name: item._id,
        value: Number(item.value || 0),
      })),
      scopeBreakdown,
      monthlyEmissions: monthlyMetrics.map((item) => ({
        name: item.name,
        value: item.emissionsTonnes,
      })),
    };
  }

  static async listCarbonData(query = {}) {
    const { page, pageSize, offset, limit } = getPagination(query);
    const filter = {
      ...buildSearchFilter(["reference", "origin", "destination", "carrier"], query.search),
    };

    if (query.status) {
      filter.status = String(query.status).toUpperCase();
    }

    if (query.transportMode) {
      filter.transportMode = String(query.transportMode).toUpperCase();
    }

    const [count, rows] = await Promise.all([
      Shipment.countDocuments(filter),
      Shipment.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    ]);

    const companyMap = await mapCompanies(rows.map((row) => row.companyId));

    return formatPaginatedResponse({
      rows: rows.map((row) => ({
        id: row.id,
        recordId: row.reference,
        companyId: row.companyId,
        companyName: companyMap[row.companyId]?.name || "Unknown company",
        category: `Transport (${row.transportMode})`,
        emissionsTonnes: Number(row.emissionsTonnes || 0),
        dateSubmitted: row.createdAt,
        status: toStatusBadge(row.status),
        rawStatus: row.status,
        origin: row.origin,
        destination: row.destination,
        carrier: row.carrier,
      })),
      count,
      page,
      pageSize,
    });
  }

  static async listReports(query = {}) {
    const { page, pageSize, offset, limit } = getPagination(query);
    const filter = {
      ...buildSearchFilter(["name", "type"], query.search),
    };

    if (query.status) {
      filter.status = String(query.status).toUpperCase();
    }

    const [count, rows] = await Promise.all([
      Report.countDocuments(filter),
      Report.find(filter).sort({ generatedAt: -1 }).skip(offset).limit(limit),
    ]);

    const companyMap = await mapCompanies(rows.map((row) => row.companyId));

    return formatPaginatedResponse({
      rows: rows.map((row) => normalizeReport(row, companyMap)),
      count,
      page,
      pageSize,
    });
  }

  static async updateReport(reportId, payload, admin) {
    const report = await Report.findById(reportId);
    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    if (payload.status !== undefined) {
      report.status = payload.status;
    }

    if (payload.downloadUrl !== undefined) {
      report.downloadUrl = payload.downloadUrl;
    }

    if (payload.metadata !== undefined) {
      report.metadata = {
        ...(report.metadata || {}),
        ...payload.metadata,
      };
    }

    await report.save();

    await logAdminAction(admin, "ADMIN_REPORT_UPDATED", {
      description: `${admin.email} updated report ${report.name}`,
      reportId: report.id,
    });

    const companyMap = await mapCompanies([report.companyId]);
    return normalizeReport(report, companyMap);
  }

  static async deleteReport(reportId, admin) {
    const report = await Report.findById(reportId);
    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    await report.deleteOne();

    await logAdminAction(admin, "ADMIN_REPORT_DELETED", {
      description: `${admin.email} deleted report ${report.name}`,
      reportId: report.id,
    });

    return { id: reportId };
  }

  static async getSettings() {
    const [settings, factors] = await Promise.all([
      ensurePlatformSettings(),
      EmissionFactor.find({
        category: { $in: Object.values(SETTINGS_FACTOR_MAP).map((item) => item.category) },
        isActive: true,
      }),
    ]);

    const factorMap = factors.reduce((accumulator, factor) => {
      accumulator[factor.category] = factor;
      return accumulator;
    }, {});

    return {
      id: settings.id,
      platformName: settings.platformName,
      supportEmail: settings.supportEmail,
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      maintenanceMode: settings.maintenanceMode,
      allowSelfSignup: settings.allowSelfSignup,
      emissionFactors: {
        road: Number(factorMap[SETTINGS_FACTOR_MAP.road.category]?.value || 0),
        air: Number(factorMap[SETTINGS_FACTOR_MAP.air.category]?.value || 0),
        ocean: Number(factorMap[SETTINGS_FACTOR_MAP.ocean.category]?.value || 0),
      },
    };
  }

  static async updateSettings(payload, admin) {
    const settings = await ensurePlatformSettings();

    if (payload.platformName !== undefined) {
      settings.platformName = payload.platformName;
    }

    if (payload.supportEmail !== undefined) {
      settings.supportEmail = payload.supportEmail;
    }

    if (payload.sessionTimeoutMinutes !== undefined) {
      settings.sessionTimeoutMinutes = Number(payload.sessionTimeoutMinutes);
    }

    if (payload.maintenanceMode !== undefined) {
      settings.maintenanceMode = Boolean(payload.maintenanceMode);
    }

    if (payload.allowSelfSignup !== undefined) {
      settings.allowSelfSignup = Boolean(payload.allowSelfSignup);
    }

    await settings.save();

    if (payload.emissionFactors) {
      await Promise.all(Object.entries(SETTINGS_FACTOR_MAP).map(async ([key, config]) => {
        if (payload.emissionFactors[key] === undefined) {
          return;
        }

        await EmissionFactor.findOneAndUpdate(
          { category: config.category },
          {
            name: config.name,
            category: config.category,
            value: Number(payload.emissionFactors[key]),
            unit: "tCO2e/ton-km",
            source: "Admin settings update",
            isActive: true,
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          },
        );
      }));
    }

    await logAdminAction(admin, "ADMIN_SETTINGS_UPDATED", {
      description: `${admin.email} updated admin settings`,
    });

    return this.getSettings();
  }
}

module.exports = AdminService;
