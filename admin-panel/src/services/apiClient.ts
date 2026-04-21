import axios from 'axios';

const API_BASE_URL = (
  import.meta.env.VITE_ADMIN_API_BASE_URL
  || import.meta.env.VITE_API_BASE_URL
  || 'http://localhost:5000/api'
).replace(/\/$/, '');

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
};

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
  },
});

axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (!config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }

  return config;
});

axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || 'Request failed';

    if (status === 401) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.dispatchEvent(new CustomEvent('carbonflow:admin-unauthorized'));
    }

    return Promise.reject(new Error(message));
  },
);

function unwrapResponse<T>(payload: T | ApiEnvelope<T>): T {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return ((payload as ApiEnvelope<T>).data ?? null) as T;
  }

  return payload as T;
}

export const apiClient = {
  get: async <T = unknown>(path: string) => unwrapResponse<T>((await axiosClient.get<T | ApiEnvelope<T>>(path)).data),
  post: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.post<T | ApiEnvelope<T>>(path, data ?? {})).data),
  put: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.put<T | ApiEnvelope<T>>(path, data ?? {})).data),
  patch: async <T = unknown>(path: string, data?: unknown) => unwrapResponse<T>((await axiosClient.patch<T | ApiEnvelope<T>>(path, data ?? {})).data),
  delete: async <T = unknown>(path: string) => unwrapResponse<T>((await axiosClient.delete<T | ApiEnvelope<T>>(path)).data),
};

export { API_BASE_URL };
