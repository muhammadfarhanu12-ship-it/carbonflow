// @ts-check

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function roundTo(value, precision = 4) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  const factor = 10 ** precision;
  return Math.round((numericValue + Number.EPSILON) * factor) / factor;
}

function convertKgToTonnes(weightKg, precision = 4) {
  return roundTo(Number(weightKg) / 1000, precision);
}

function buildRouteLabel(origin, destination) {
  return `${String(origin).trim()} -> ${String(destination).trim()}`;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? "").trim());
}

function toTrimmedString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function toDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dateValue.getTime()) ? null : dateValue;
}

module.exports = {
  buildRouteLabel,
  convertKgToTonnes,
  isUuid,
  roundTo,
  toDate,
  toFiniteNumber,
  toTrimmedString,
};
