function sanitizeString(value) {
  return String(value)
    .replace(/\0/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/[<>]/g, "")
    .trim();
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value && typeof value === "object" && !(value instanceof Date) && !(value instanceof RegExp)) {
    return Object.entries(value).reduce((accumulator, [key, nestedValue]) => {
      if (key.startsWith("$") || key.includes(".")) {
        return accumulator;
      }

      accumulator[key] = sanitizeValue(nestedValue);
      return accumulator;
    }, {});
  }

  return value;
}

module.exports = {
  sanitizeValue,
  sanitizeString,
};
