function sanitizeValue(value) {
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
};
