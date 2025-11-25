import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { User } from '@/lib/auth';
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  getCurrentUser,
  refreshToken,
} from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Set up token refresh interval
  useEffect(() => {
    if (!user) return;

    // Refresh token every 10 minutes
    const interval = setInterval(async () => {
      const result = await refreshToken();
      if (!result) {
        setUser(null);
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUser(result.user);
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  const register = async (email: string, username: string, password: string) => {
    const result = await apiRegister(email, username, password);
    setUser(result.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        register,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
