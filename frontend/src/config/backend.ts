function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const DEFAULT_BACKEND_ORIGIN = "https://carbonflow-h9cj.onrender.com";
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

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const rawApiBaseUrl = API_BASE || DEFAULT_API_BASE_URL;
const rawSocketUrl = import.meta.env.VITE_SOCKET_URL;
const normalizedApiBaseUrl = normalizeAbsoluteUrl(rawApiBaseUrl, "VITE_API_BASE_URL", DEFAULT_API_BASE_URL);

const BACKEND_ORIGIN = normalizedApiBaseUrl.replace(/\/api\/?$/i, "");
const API_BASE_URL = /\/api$/i.test(normalizedApiBaseUrl)
  ? normalizedApiBaseUrl
  : `${BACKEND_ORIGIN}/api`;
const SOCKET_URL = rawSocketUrl
  ? normalizeAbsoluteUrl(rawSocketUrl, "VITE_SOCKET_URL", DEFAULT_BACKEND_ORIGIN).replace(/\/api\/?$/i, "")
  : BACKEND_ORIGIN;

export { API_BASE_URL, BACKEND_ORIGIN, SOCKET_URL };
