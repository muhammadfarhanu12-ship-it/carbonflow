function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const PRODUCTION_BACKEND_ORIGIN = "https://carbonflow-h9cj.onrender.com";
const LOCAL_BACKEND_ORIGIN = "http://localhost:5000";
const IS_PRODUCTION_BUILD = import.meta.env.PROD;
const DEFAULT_BACKEND_ORIGIN = IS_PRODUCTION_BUILD ? PRODUCTION_BACKEND_ORIGIN : LOCAL_BACKEND_ORIGIN;
const DEFAULT_API_BASE_URL = `${DEFAULT_BACKEND_ORIGIN}/api`;

function normalizeAbsoluteUrl(value: string, variableName: string, exampleUrl: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Missing ${variableName}. Set it to your backend URL, for example ${exampleUrl}.`);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(`${variableName} must be an absolute URL, for example ${exampleUrl}.`);
  }

  parsedUrl.hash = "";
  return trimTrailingSlash(parsedUrl.toString());
}

function isLocalhostUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function resolveApiBaseUrl() {
  const configuredApiBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

  if (!configuredApiBase) {
    return DEFAULT_API_BASE_URL;
  }

  const normalizedConfiguredApiBase = normalizeAbsoluteUrl(
    configuredApiBase,
    "VITE_API_URL",
    DEFAULT_API_BASE_URL,
  );

  if (IS_PRODUCTION_BUILD && isLocalhostUrl(normalizedConfiguredApiBase)) {
    return DEFAULT_API_BASE_URL;
  }

  return normalizedConfiguredApiBase;
}

const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;
const normalizedApiBaseUrl = resolveApiBaseUrl();

const BACKEND_ORIGIN = normalizedApiBaseUrl.replace(/\/api\/?$/i, "");
const API_BASE_URL = /\/api$/i.test(normalizedApiBaseUrl)
  ? normalizedApiBaseUrl
  : `${BACKEND_ORIGIN}/api`;
const SOCKET_URL = rawSocketUrl
  ? normalizeAbsoluteUrl(rawSocketUrl, "VITE_SOCKET_URL", DEFAULT_BACKEND_ORIGIN).replace(/\/api\/?$/i, "")
  : BACKEND_ORIGIN;

export { API_BASE_URL, BACKEND_ORIGIN, SOCKET_URL };
