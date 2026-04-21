const { sanitizeValue } = require("../utils/sanitize");

function sanitizeRequest(req, _res, next) {
  req.body = sanitizeValue(req.body);
  req.query = sanitizeValue(req.query);
  req.params = sanitizeValue(req.params);
  next();
}

module.exports = {
  sanitizeRequest,
};
