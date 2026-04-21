import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/src/hooks/useAuth";
import type { SessionUser } from "@/src/types/platform";

export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const { user: authenticatedUser, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated || !authenticatedUser) {
      setUser(null);
      setIsAdmin(false);
      navigate("/auth/signin", { replace: true });
      return;
    }

    const hasAdminAccess = authenticatedUser.role === "ADMIN" || authenticatedUser.role === "SUPERADMIN";
    setUser(authenticatedUser);
    setIsAdmin(hasAdminAccess);

    if (!hasAdminAccess) {
      navigate("/app", { replace: true });
    }
  }, [authenticatedUser, isAuthenticated, isLoading, navigate]);

  return { isAdmin, user, isAuthenticated, isLoading };
}
