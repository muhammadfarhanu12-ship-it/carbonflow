const ApiError = require("../utils/ApiError");

function allowRoles(...roles) {
  const allowedRoles = roles.map((role) => String(role).toUpperCase());

  return (req, _res, next) => {
    const userRole = String(req.user?.role || "").toUpperCase();

    if (!userRole || !allowedRoles.includes(userRole)) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }

    return next();
  };
}

module.exports = allowRoles;
