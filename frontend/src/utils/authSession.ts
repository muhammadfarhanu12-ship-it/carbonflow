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
    return JSON.parse(rawUser) as SessionUser;
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
  return {
    token: getAccessToken(),
    refreshToken: getRefreshToken(),
    user: parseStoredUser(readStorage(USER_KEY)),
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

