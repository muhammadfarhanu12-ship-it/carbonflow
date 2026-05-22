import type { PaginatedResponse, PaginationMeta } from "@/src/types/platform";

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 1,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function asNumber(value: unknown, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function normalizePagination(value: unknown, pageSize = DEFAULT_PAGINATION.pageSize): PaginationMeta {
  if (!isRecord(value)) {
    return { ...DEFAULT_PAGINATION, pageSize };
  }

  return {
    page: asNumber(value.page, DEFAULT_PAGINATION.page),
    pageSize: asNumber(value.pageSize, pageSize),
    total: asNumber(value.total, DEFAULT_PAGINATION.total),
    totalPages: asNumber(value.totalPages, DEFAULT_PAGINATION.totalPages),
    hasNextPage: Boolean(value.hasNextPage),
    hasPreviousPage: Boolean(value.hasPreviousPage),
  };
}

export function normalizePaginatedResponse<T>(payload: unknown, pageSize = DEFAULT_PAGINATION.pageSize): PaginatedResponse<T> {
  if (Array.isArray(payload)) {
    return {
      data: payload as T[],
      pagination: {
        ...DEFAULT_PAGINATION,
        pageSize,
        total: payload.length,
        totalPages: payload.length > 0 ? 1 : 0,
      },
    };
  }

  if (!isRecord(payload)) {
    return {
      data: [],
      pagination: { ...DEFAULT_PAGINATION, pageSize },
    };
  }

  return {
    data: asArray<T>(payload.data),
    pagination: normalizePagination(payload.pagination, pageSize),
  };
}
