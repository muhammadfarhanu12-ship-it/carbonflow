import type { AuthResponse, SessionUser } from "@/src/types/platform";

const ACCESS_TOKEN_KEY = "token";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "user";
const ROLE_KEY = "role";

export interface StoredSession {
  token: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage(key: string) {
  return canUseStorage() ? window.localStorage.getItem(key) : null;
}

function writeStorage(key: string, value: string) {
  if (canUseStorage()) {
    window.localStorage.setItem(key, value);
  }
}

function removeStorage(key: string) {
  if (canUseStorage()) {
    window.localStorage.removeItem(key);
  }
}

function parseStoredUser(rawUser: string | null): SessionUser | null {
  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as Partial<SessionUser>;

    if (!parsed || typeof parsed !== "object" || !parsed.id || !parsed.email || !parsed.role) {
      removeStorage(USER_KEY);
      removeStorage(ROLE_KEY);
      return null;
    }

    return {
      id: String(parsed.id),
      companyId: String(parsed.companyId || parsed.organizationId || ""),
      organizationId: parsed.organizationId ? String(parsed.organizationId) : parsed.companyId ? String(parsed.companyId) : "",
      name: String(parsed.name || parsed.email || "CarbonFlow user"),
      email: String(parsed.email),
      role: parsed.role,
    };
  } catch {
    removeStorage(USER_KEY);
    removeStorage(ROLE_KEY);
    return null;
  }
}

export function getAccessToken() {
  return readStorage(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return readStorage(REFRESH_TOKEN_KEY);
}

export function getStoredSession(): StoredSession {
  const token = getAccessToken();
  const user = parseStoredUser(readStorage(USER_KEY));

  if (token && !user) {
    clearStoredSession();
    return {
      token: null,
      refreshToken: null,
      user: null,
    };
  }

  return {
    token,
    refreshToken: getRefreshToken(),
    user,
  };
}

export function setStoredTokens({ token, refreshToken }: { token: string; refreshToken?: string | null }) {
  writeStorage(ACCESS_TOKEN_KEY, token);

  if (refreshToken) {
    writeStorage(REFRESH_TOKEN_KEY, refreshToken);
    return;
  }

  removeStorage(REFRESH_TOKEN_KEY);
}

export function setStoredUser(user: SessionUser) {
  if (!user?.id || !user?.email || !user?.role) {
    clearStoredSession();
    return;
  }

  writeStorage(USER_KEY, JSON.stringify(user));
  writeStorage(ROLE_KEY, user.role);
}

export function persistSession(session: AuthResponse) {
  setStoredTokens({
    token: session.token,
    refreshToken: session.refreshToken,
  });
  setStoredUser(session.user);
}

export function clearStoredSession() {
  removeStorage(ACCESS_TOKEN_KEY);
  removeStorage(REFRESH_TOKEN_KEY);
  removeStorage(USER_KEY);
  removeStorage(ROLE_KEY);
}
