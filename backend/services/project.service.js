const { CarbonProject } = require("../models");
const ApiError = require("../utils/ApiError");
const { getPagination, formatPaginatedResponse } = require("../utils/pagination");
const MarketplaceService = require("./marketplace.service");

function buildSearchFilter(search) {
  if (!search) {
    return {};
  }

  const expression = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return {
    $or: [
      { name: expression },
      { type: expression },
      { location: expression },
      { certification: expression },
    ],
  };
}

class ProjectService {
  static async listProjects(companyId, query = {}) {
    const { page, pageSize, offset, limit } = getPagination(query);
    const filter = {
      companyId,
      ...buildSearchFilter(query.search),
    };

    if (query.status) {
      filter.status = String(query.status).toUpperCase();
    }

    const [count, rows] = await Promise.all([
      CarbonProject.countDocuments(filter),
      CarbonProject.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
    ]);

    return formatPaginatedResponse({
      rows: rows.map((row) => row.toJSON()),
      count,
      page,
      pageSize,
    });
  }

  static async getProjectById(id, companyId) {
    const project = await CarbonProject.findOne({ _id: id, companyId });
    if (!project) {
      throw new ApiError(404, "Project not found");
    }

    return project.toJSON();
  }

  static async createProject(payload, companyId, actor = null) {
    return MarketplaceService.create(payload, companyId, actor);
  }

  static async updateProject(id, payload, companyId, actor = null) {
    return MarketplaceService.update(id, payload, companyId, actor);
  }

  static async deleteProject(id, companyId, actor = null) {
    return MarketplaceService.remove(id, companyId, actor);
  }
}

module.exports = ProjectService;
