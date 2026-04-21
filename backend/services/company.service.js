const { Company } = require("../models");
const BaseService = require("./base.service");

class CompanyService extends BaseService {
  static list(query = {}) {
    return this.buildListResult(Company, {
      query,
      filter: this.getLikeFilter(["name", "industry", "headquarters"], query.search),
    });
  }

  static getById(id) {
    return Company.findByPk(id);
  }

  static create(payload) {
    return Company.create(payload);
  }

  static async update(id, payload) {
    const company = await Company.findByPk(id);
    if (!company) {
      const error = new Error("Company not found");
      error.status = 404;
      throw error;
    }

    await company.update(payload);
    return company;
  }

  static async remove(id) {
    const company = await Company.findByPk(id);
    if (!company) {
      const error = new Error("Company not found");
      error.status = 404;
      throw error;
    }

    await company.destroy();
    return { success: true };
  }
}

module.exports = CompanyService;
