const ApiError = require("../utils/ApiError");

function mapJoiErrorDetails(details = []) {
  return details.map((item) => ({
    field: item.path.join("."),
    message: item.message,
  }));
}

function validateSchema(schema, source = "body") {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return next(new ApiError(422, "Validation failed", mapJoiErrorDetails(error.details)));
    }

    req[source] = value;
    return next();
  };
}

module.exports = validateSchema;
