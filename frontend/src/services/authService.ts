import { apiClient } from "./apiClient";
import type { AuthResponse, SessionUser } from "@/src/types/platform";
import {
  clearStoredSession,
  getStoredSession,
  persistSession,
  setStoredUser,
} from "@/src/utils/authSession";

export interface SignupData {
  name: string;
  email: string;
  password: string;
  company?: string;
  confirmPassword?: string;
}

export interface SignupResponse {
  email: string;
  verificationRequired: boolean;
}

export interface SigninData {
  email: string;
  password: string;
  rememberMe?: boolean;
}

type BackendAuthUser = {
  id: string;
  name?: string;
  fullName?: string;
  email: string;
  role: string;
  companyId?: string | null;
  organizationId?: string | null;
  companyName?: string | null;
};

type BackendAuthPayload = {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  user: BackendAuthUser;
};

class AuthService {
  private normalizeUser(user: BackendAuthUser): SessionUser {
    const normalizedRole = String(user.role || "ANALYST").toUpperCase();
    const role = (normalizedRole === "USER" ? "ANALYST" : normalizedRole) as SessionUser["role"];
    const organizationId = user.organizationId ?? user.companyId ?? "";

    return {
      id: user.id,
      name: user.name || user.fullName || "",
      email: user.email,
      role,
      companyId: user.companyId ?? organizationId,
      organizationId,
    };
  }

  private normalizeAuthResponse(response: BackendAuthPayload): AuthResponse {
    const token = response.token || response.accessToken;

    if (!token) {
      throw new Error("Authentication token missing from server response");
    }

    if (!response.user) {
      throw new Error("Authenticated user missing from server response");
    }

    return {
      token,
      refreshToken: response.refreshToken,
      user: this.normalizeUser(response.user),
    };
  }

  async signup(data: SignupData): Promise<SignupResponse> {
    const response = await apiClient.post<{ email?: string; verificationRequired?: boolean }>("/auth/signup", {
      name: data.name,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword || data.password,
      companyName: data.company || undefined,
    });

    return {
      email: response?.email || data.email,
      verificationRequired: response?.verificationRequired ?? true,
    };
  }

  async signin(data: SigninData): Promise<AuthResponse> {
    const response = await apiClient.post<BackendAuthPayload>("/auth/login", {
      email: data.email,
      password: data.password,
      rememberMe: Boolean(data.rememberMe),
    });
    return this.normalizeAuthResponse(response);
  }

  async forgotPassword(email: string): Promise<void> {
    await apiClient.post("/auth/forgot-password", { email });
  }

  async resetPassword(password: string, token: string): Promise<void> {
    await apiClient.post("/auth/reset-password", {
      token,
      password,
      confirmPassword: password,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const normalizedToken = String(token || "").trim();

    if (!normalizedToken) {
      throw new Error("Verification token is required");
    }

    await apiClient.post("/auth/verify-email", {
      token: normalizedToken,
    });
  }

  async resendVerification(email: string): Promise<{ email: string }> {
    const normalizedEmail = String(email || "").trim();

    if (!normalizedEmail) {
      throw new Error("Email is required");
    }

    const response = await apiClient.post<{ email?: string }>("/auth/resend-verification", {
      email: normalizedEmail,
    });

    return {
      email: response?.email || normalizedEmail,
    };
  }

  async getCurrentUser(): Promise<SessionUser> {
    const response = await apiClient.get<BackendAuthUser>("/auth/me");
    return this.normalizeUser(response);
  }

  async logout(): Promise<void> {
    const { token } = this.getSession();

    try {
      if (token) {
        await apiClient.post("/auth/logout");
      }
    } catch {
      // Session cleanup continues even if the backend rejects logout.
    } finally {
      this.clearSession();
    }
  }

  clearSession(): void {
    clearStoredSession();
  }

  setSession(response: AuthResponse): void {
    persistSession(response);
  }

  updateSessionUser(user: SessionUser): void {
    setStoredUser(user);
  }

  getSession(): { token: string | null; refreshToken: string | null; user: SessionUser | null } {
    return getStoredSession();
  }
}

export const authService = new AuthService();
export type { AuthResponse, SessionUser as User };
