const { getPagination, formatPaginatedResponse } = require("../utils/pagination");
const { buildSearchFilter } = require("../models/helpers/model.utils");

class BaseService {
  static getLikeFilter(fields, search) {
    return buildSearchFilter(fields, search);
  }

  static async buildListResult(model, options) {
    const { query = {}, filter = {}, populate = [], sort = { createdAt: -1 } } = options;
    const { page, pageSize, offset, limit } = getPagination(query);

    const [count, rows] = await Promise.all([
      model.countDocuments(filter),
      model.find(filter).sort(sort).skip(offset).limit(limit).populate(populate),
    ]);

    return formatPaginatedResponse({ count, rows, page, pageSize });
  }
}

module.exports = BaseService;
