function sendSuccess(res, { statusCode = 200, message = "", data = null, meta = undefined } = {}) {
  const payload = {
    success: true,
    message,
    data,
  };

  if (meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

function sendError(res, { statusCode = 500, message = "Internal server error", errors = undefined } = {}) {
  const payload = {
    success: false,
    message,
  };

  if (errors !== undefined) {
    payload.errors = errors;
  }

  return res.status(statusCode).json(payload);
}

module.exports = {
  sendSuccess,
  sendError,
};
