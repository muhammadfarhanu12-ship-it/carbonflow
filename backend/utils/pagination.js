function getPagination(query = {}) {
  const page = Math.max(Number(query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset, limit: pageSize };
}

function formatPaginatedResponse({ rows, count, page, pageSize }) {
  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: Math.ceil(count / pageSize) || 1,
    },
  };
}

module.exports = { getPagination, formatPaginatedResponse };
