import axios, { AxiosError, AxiosHeaders } from "axios";
import { API_BASE_URL, BACKEND_ORIGIN } from "../config/backend";
import {
  clearStoredSession,
  getAccessToken,
  getRefreshToken,
  setStoredTokens,
} from "@/src/utils/authSession";

const REQUEST_TIMEOUT_MS = 15000;
const COLD_START_RETRY_DELAY_MS = 1200;
const COLD_START_RETRY_STATUS_CODES = new Set([502, 503, 504]);
const UNAUTHORIZED_EVENT_NAME = "carbonflow:unauthorized";
const API_ERROR_EVENT_NAME = "carbonflow:api-error";
const API_RETRY_EVENT_NAME = "carbonflow:api-retry";
let lastUnauthorizedEventAt = 0;
let lastApiErrorEventAt = 0;
let lastApiErrorSignature = "";
let lastApiRetryEventAt = 0;
let lastApiRetrySignature = "";

type AuthFailureReason = "session_expired" | "unauthorized";

type AuthFailureDetail = {
  reason: AuthFailureReason;
  message?: string;
};

type ApiErrorDetail = {
  message: string;
  statusCode?: number;
  path?: string;
};

type ApiRetryDetail = {
  message: string;
  path?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
};

function parseBackendErrorPayload(payload: unknown) {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as { message?: string; error?: string };
      return parsed.message || parsed.error || payload;
    } catch {
      return payload;
    }
  }

  if (typeof payload === "object") {
    return (payload as { message?: string; error?: string }).message
      || (payload as { message?: string; error?: string }).error
      || null;
  }

  return null;
}

async function extractBackendMessage(error: AxiosError) {
  const responseData = error.response?.data;
  if (!responseData) {
    return null;
  }

  if (typeof Blob !== "undefined" && responseData instanceof Blob) {
    const contentType = String(responseData.type || error.response?.headers?.["content-type"] || "");
    if (!contentType.includes("json") && !contentType.startsWith("text/")) {
      return null;
    }

    const text = await responseData.text();
    return parseBackendErrorPayload(text);
  }

  return parseBackendErrorPayload(responseData);
}

function buildRequestUrl(error: AxiosError) {
  const baseUrl = error.config?.baseURL || API_BASE_URL;
  const requestPath = error.config?.url || "";

  try {
    return new URL(requestPath, `${baseUrl}/`).toString();
  } catch {
    return `${baseUrl}${requestPath}`;
  }
}

function dispatchUnauthorizedEvent(detail: AuthFailureDetail) {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();

  if (now - lastUnauthorizedEventAt < 1000) {
    return;
  }

  lastUnauthorizedEventAt = now;
  window.dispatchEvent(new CustomEvent<AuthFailureDetail>(UNAUTHORIZED_EVENT_NAME, { detail }));
}

function dispatchApiErrorEvent(detail: ApiErrorDetail) {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  const signature = `${detail.statusCode || 0}:${detail.path || ""}:${detail.message}`;

  if (signature === lastApiErrorSignature && now - lastApiErrorEventAt < 1500) {
    return;
  }

  lastApiErrorEventAt = now;
  lastApiErrorSignature = signature;
  window.dispatchEvent(new CustomEvent<ApiErrorDetail>(API_ERROR_EVENT_NAME, { detail }));
}

function dispatchApiRetryEvent(detail: ApiRetryDetail) {
  if (typeof window === "undefined") {
    return;
  }

  const now = Date.now();
  const signature = `${detail.path || ""}:${detail.message}`;

  if (signature === lastApiRetrySignature && now - lastApiRetryEventAt < 1500) {
    return;
  }

  lastApiRetryEventAt = now;
  lastApiRetrySignature = signature;
  window.dispatchEvent(new CustomEvent<ApiRetryDetail>(API_RETRY_EVENT_NAME, { detail }));
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryColdStart(
  error: AxiosError,
  requestConfig: { _coldStartRetried?: boolean },
) {
  if (requestConfig._coldStartRetried) {
    return false;
  }

  if (error.code === "ERR_CANCELED") {
    return false;
  }

  const status = error.response?.status;
  if (typeof status === "number" && COLD_START_RETRY_STATUS_CODES.has(status)) {
    return true;
  }

  return !error.response && (error.code === "ECONNABORTED" || error.code === "ERR_NETWORK");
}

async function buildApiErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Request failed";
  }

  const backendMessage = await extractBackendMessage(error);

  if (backendMessage) {
    return backendMessage;
  }

  const requestUrl = buildRequestUrl(error);

  if (error.code === "ECONNABORTED") {
    return `Request to ${requestUrl} timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Check that the backend is responsive.`;
  }

  if (error.response?.status === 404) {
    return `Backend route not found at ${requestUrl}. Check VITE_API_BASE_URL and the /api route prefix.`;
  }

  if (error.response?.status === 500) {
    return `Backend returned a 500 error for ${requestUrl}. Check the backend logs for the real failure.`;
  }

  if (error.request) {
    return `Cannot connect to backend API at ${API_BASE_URL}. Make sure the backend server is running at ${BACKEND_ORIGIN} and VITE_API_BASE_URL matches.`;
  }

  return error.message || "Request failed";
}

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: REQUEST_TIMEOUT_MS,
  headers: {
    Accept: "application/json",
  },
});

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  config.headers = config.headers || new AxiosHeaders();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
  if (!isFormData && !config.headers["Content-Type"]) {
    config.headers["Content-Type"] = "application/json";
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  if (!refreshPromise) {
    refreshPromise = axios.post<ApiEnvelope<{ accessToken?: string; token?: string; refreshToken?: string }>>(
      `${API_BASE_URL}/auth/refresh-token`,
      { refreshToken },
      {
        timeout: REQUEST_TIMEOUT_MS,
        withCredentials: true,
      },
    )
      .then((response) => {
        const payload = (response.data?.data ?? response.data) as { accessToken?: string; token?: string; refreshToken?: string };
        const accessToken = payload?.accessToken || payload?.token || null;

        if (accessToken) {
          setStoredTokens({
            token: accessToken,
            refreshToken: payload?.refreshToken ?? refreshToken,
          });
        }

        return accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = (error.config || {}) as typeof error.config & {
      _retry?: boolean;
      _coldStartRetried?: boolean;
    };
    const requestPath = String(originalRequest.url || "");
    const isAuthFlowRequest = [
      "/auth/login",
      "/auth/signup",
      "/auth/signin",
      "/auth/forgot-password",
      "/auth/reset-password",
      "/auth/refresh-token",
      "/auth/verify-email",
      "/auth/resend-verification",
    ].some((path) => requestPath.includes(path));
    const hadToken = Boolean(getAccessToken());

    if (shouldRetryColdStart(error, originalRequest)) {
      originalRequest._coldStartRetried = true;
      dispatchApiRetryEvent({
        message: "Waking backend server. Retrying request once...",
        path: requestPath || undefined,
      });
      await wait(COLD_START_RETRY_DELAY_MS);
      return axiosClient(originalRequest);
    }

    if (
      status === 401
      && !originalRequest._retry
      && !isAuthFlowRequest
    ) {
      originalRequest._retry = true;
      const accessToken = await refreshAccessToken();

      if (accessToken) {
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axiosClient(originalRequest);
      }
    }

    const message = await buildApiErrorMessage(error);

    if (status === 401 && !isAuthFlowRequest) {
      clearStoredSession();
      dispatchUnauthorizedEvent({
        reason: hadToken ? "session_expired" : "unauthorized",
        message,
      });
    } else if (!isAuthFlowRequest) {
      dispatchApiErrorEvent({
        message,
        statusCode: status,
        path: requestPath || undefined,
      });
    }

    console.error("API ERROR:", error);

    return Promise.reject(new Error(message));
  },
);

function unwrapResponse<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === "object" && "success" in payload) {
    return ((payload as ApiEnvelope<T>).data ?? null) as T;
  }

  return payload as T;
}

function buildAbsoluteApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const requestPath = `${API_BASE_URL.replace(/\/$/, "")}${normalizedPath}`;
  const origin = typeof window !== "undefined" ? window.location.origin : BACKEND_ORIGIN;

  try {
    return new URL(requestPath, origin).toString();
  } catch {
    return requestPath;
  }
}

export const apiClient = {
  get: async <T = unknown>(path: string) => unwrapResponse<T>((await axiosClient.get<T | ApiEnvelope<T>>(path)).data),
  post: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.post<T | ApiEnvelope<T>>(path, data ?? {})).data),
  put: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.put<T | ApiEnvelope<T>>(path, data ?? {})).data),
  patch: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.patch<T | ApiEnvelope<T>>(path, data ?? {})).data),
  delete: async <T = unknown>(path: string) => unwrapResponse<T>((await axiosClient.delete<T | ApiEnvelope<T>>(path)).data),
  postForm: async <T = unknown>(path: string, data: FormData) => unwrapResponse<T>((await axiosClient.post<T | ApiEnvelope<T>>(path, data)).data),
};

export { API_BASE_URL, axiosClient, buildAbsoluteApiUrl };
