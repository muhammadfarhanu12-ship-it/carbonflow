import React, { createContext, useContext, useState, useEffect } from 'react';
import { adminAuthService } from '../services/adminAuthService';
import type { AdminSessionUser, LoginData } from '../types/admin';

interface AuthContextType {
  isAuthenticated: boolean;
  user: AdminSessionUser | null;
  isLoading: boolean;
  login: (data: LoginData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const session = adminAuthService.getSession();

      if (!session.token) {
        setIsLoading(false);
        return;
      }

      try {
        const currentAdmin = await adminAuthService.getCurrentAdmin();
        localStorage.setItem('adminUser', JSON.stringify(currentAdmin));
        setUser(currentAdmin);
        setIsAuthenticated(true);
      } catch (_error) {
        adminAuthService.logout();
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    const handleUnauthorized = () => {
      adminAuthService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    };

    void checkAuth();
    window.addEventListener('carbonflow:admin-unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('carbonflow:admin-unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (data: LoginData) => {
    setIsLoading(true);
    try {
      const resp = await adminAuthService.login(data);
      setUser(resp.admin);
      setIsAuthenticated(true);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    adminAuthService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
