function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeAbsoluteUrl(value: string, variableName: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Missing ${variableName}. Set it to your backend URL, for example http://localhost:5000.`);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new Error(`${variableName} must be an absolute URL, for example http://localhost:5000.`);
  }

  parsedUrl.hash = "";
  return trimTrailingSlash(parsedUrl.toString());
}

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!rawApiBaseUrl) {
  throw new Error("Missing VITE_API_BASE_URL. Define it in frontend/.env so CarbonFlow can reach the backend API and Socket.IO server.");
}

const normalizedApiBaseUrl = normalizeAbsoluteUrl(rawApiBaseUrl, "VITE_API_BASE_URL");

const BACKEND_ORIGIN = normalizedApiBaseUrl.replace(/\/api\/?$/i, "");
const API_BASE_URL = /\/api$/i.test(normalizedApiBaseUrl)
  ? normalizedApiBaseUrl
  : `${BACKEND_ORIGIN}/api`;
const SOCKET_URL = BACKEND_ORIGIN;

export { API_BASE_URL, BACKEND_ORIGIN, SOCKET_URL };
