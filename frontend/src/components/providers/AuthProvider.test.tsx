import { useContext, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthContext, AuthProvider } from "./AuthProvider";

const authServiceMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCurrentUser: vi.fn(),
  clearSession: vi.fn(),
  signin: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
  setSession: vi.fn(),
  updateSessionUser: vi.fn(),
}));

vi.mock("@/src/services/authService", () => ({
  authService: authServiceMock,
}));

function AuthStateProbe() {
  const auth = useContext(AuthContext);
  const location = useLocation();
  const [error, setError] = useState("");

  if (!auth) {
    throw new Error("Missing auth context");
  }

  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="loading">{String(auth.isLoading)}</div>
      <div data-testid="authenticated">{String(auth.isAuthenticated)}</div>
      <div data-testid="email">{auth.user?.email ?? "none"}</div>
      <div data-testid="error">{error || "none"}</div>
      <button
        type="button"
        onClick={async () => {
          try {
            await auth.signin({ email: "user@example.com", password: "Secret123!" });
          } catch (signinError) {
            setError(signinError instanceof Error ? signinError.message : "failed");
          }
        }}
      >
        Sign in
      </button>
    </div>
  );
}

function renderWithAuth(initialPath = "/app") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/app" element={<AuthStateProbe />} />
          <Route path="/auth/signin" element={<AuthStateProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  test("does not authenticate from stored session data until the backend confirms the token", async () => {
    authServiceMock.getSession.mockReturnValue({
      token: "stale-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "cached@example.com",
        name: "Cached User",
        role: "ANALYST",
        companyId: "company-1",
        organizationId: "company-1",
      },
    });
    authServiceMock.getCurrentUser.mockRejectedValue(new Error("Cannot connect to authentication server."));

    renderWithAuth("/app");

    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("email")).toHaveTextContent("none");

    await waitFor(() => {
      expect(screen.getByTestId("pathname")).toHaveTextContent("/auth/signin");
    });

    expect(authServiceMock.clearSession).toHaveBeenCalled();
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("email")).toHaveTextContent("none");
  });

  test("keeps the session only after backend verification succeeds", async () => {
    authServiceMock.getSession.mockReturnValue({
      token: "valid-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "cached@example.com",
        name: "Cached User",
        role: "ANALYST",
        companyId: "company-1",
        organizationId: "company-1",
      },
    });
    authServiceMock.getCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "verified@example.com",
      name: "Verified User",
      role: "ANALYST",
      companyId: "company-1",
      organizationId: "company-1",
    });

    renderWithAuth("/app");

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(authServiceMock.updateSessionUser).toHaveBeenCalledWith({
      id: "user-1",
      email: "verified@example.com",
      name: "Verified User",
      role: "ANALYST",
      companyId: "company-1",
      organizationId: "company-1",
    });
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("email")).toHaveTextContent("verified@example.com");
  });

  test("clears any stale session when sign-in fails", async () => {
    const user = userEvent.setup();

    authServiceMock.getSession.mockReturnValue({
      token: null,
      refreshToken: null,
      user: null,
    });
    authServiceMock.signin.mockRejectedValue(
      new Error("Cannot connect to authentication server. Please try again when the server is available."),
    );

    renderWithAuth("/auth/signin");

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("Cannot connect to authentication server.");
    });

    expect(authServiceMock.clearSession).toHaveBeenCalledTimes(1);
    expect(authServiceMock.setSession).not.toHaveBeenCalled();
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("email")).toHaveTextContent("none");
  });

  test("stores the authenticated session only after successful sign-in", async () => {
    const user = userEvent.setup();
    const authResponse = {
      token: "valid-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Signed In User",
        role: "ANALYST",
        companyId: "company-1",
        organizationId: "company-1",
      },
    };

    authServiceMock.getSession.mockReturnValue({
      token: null,
      refreshToken: null,
      user: null,
    });
    authServiceMock.signin.mockResolvedValue(authResponse);

    renderWithAuth("/auth/signin");

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    });

    expect(authServiceMock.setSession).toHaveBeenCalledWith(authResponse);
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });
});
