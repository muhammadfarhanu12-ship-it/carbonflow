import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authService, type SigninData, type SignupData, type User } from "@/src/services/authService";
import type { AuthResponse } from "@/src/types/platform";

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signin: (data: SigninData) => Promise<AuthResponse>;
  signup: (data: SignupData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthRoute(pathname: string) {
  return pathname.startsWith("/auth/");
}

function shouldSkipSigninRedirect(pathname: string) {
  return isAuthRoute(pathname) && pathname !== "/auth/logout";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  const clearSessionState = useCallback(() => {
    authService.clearSession();
    setUser(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      const session = authService.getSession();

      if (!session.token) {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }

      if (session.user && !cancelled) {
        setUser(session.user);
      }

      try {
        const currentUser = await authService.getCurrentUser();

        if (!cancelled) {
          authService.updateSessionUser(currentUser);
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          clearSessionState();
          if (!shouldSkipSigninRedirect(pathnameRef.current)) {
            navigate("/auth/signin", { replace: true });
          }
        }
        return;
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [clearSessionState, navigate]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearSessionState();

      if (!shouldSkipSigninRedirect(pathnameRef.current)) {
        navigate("/auth/signin", { replace: true });
      }
    };

    window.addEventListener("carbonflow:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("carbonflow:unauthorized", handleUnauthorized);
  }, [clearSessionState, navigate]);

  const signin = useCallback(async (data: SigninData) => {
    const response = await authService.signin(data);
    authService.setSession(response);
    setUser(response.user);
    setIsLoading(false);
    return response;
  }, []);

  const signup = useCallback(async (data: SignupData) => authService.signup(data), []);

  const logout = useCallback(async () => {
    clearSessionState();
    await authService.logout();

    if (!shouldSkipSigninRedirect(pathnameRef.current)) {
      navigate("/auth/signin", { replace: true });
    }
  }, [clearSessionState, navigate]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    signin,
    signup,
    logout,
  }), [isLoading, logout, signin, signup, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
