'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Role } from './types';
import { fetchGraphQL } from './graphql-client';
import { LOGIN_MUTATION, REGISTER_MUTATION, ME_QUERY } from './graphql-queries';

interface AuthContextType {
  user: User | null;
  role: Role | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isMember: boolean;
  isLibrarian: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, name: string) => Promise<User>;
  logout: () => Promise<void>;
  switchDemoUser: (role: Role) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_CREDENTIALS: Record<Role, { email: string; pass: string; name: string }> = {
  MEMBER: {
    email: 'patron@example.com',
    pass: 'MemberPass123!',
    name: 'Patron User',
  },
  LIBRARIAN: {
    email: 'librarian@example.com',
    pass: 'LibrarianPass123!',
    name: 'Desk Librarian',
  },
  ADMIN: {
    email: 'admin@example.com',
    pass: 'AdminPass123!',
    name: 'Chief Administrator',
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('bookdrop_access_token');
      const storedUser = localStorage.getItem('bookdrop_user');
      if (storedToken && storedUser) {
        setAccessToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // Ignore parse errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const data = await fetchGraphQL<{
      login: { accessToken: string; refreshToken: string; user: User };
    }>(LOGIN_MUTATION, { input: { email, password } });

    const payload = data.login;
    localStorage.setItem('bookdrop_access_token', payload.accessToken);
    localStorage.setItem('bookdrop_refresh_token', payload.refreshToken);
    localStorage.setItem('bookdrop_user', JSON.stringify(payload.user));

    setAccessToken(payload.accessToken);
    setUser(payload.user);
    return payload.user;
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string): Promise<User> => {
      const data = await fetchGraphQL<{
        register: { accessToken: string; refreshToken: string; user: User };
      }>(REGISTER_MUTATION, { input: { email, password, name } });

      const payload = data.register;
      localStorage.setItem('bookdrop_access_token', payload.accessToken);
      localStorage.setItem('bookdrop_refresh_token', payload.refreshToken);
      localStorage.setItem('bookdrop_user', JSON.stringify(payload.user));

      setAccessToken(payload.accessToken);
      setUser(payload.user);
      return payload.user;
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('bookdrop_refresh_token');
      if (refreshToken) {
        await fetchGraphQL(
          `mutation Logout($token: String!) { logout(refreshToken: $token) }`,
          { token: refreshToken }
        ).catch(() => { });
      }
    } finally {
      localStorage.removeItem('bookdrop_access_token');
      localStorage.removeItem('bookdrop_refresh_token');
      localStorage.removeItem('bookdrop_user');
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const refreshUserProfile = useCallback(async () => {
    try {
      const data = await fetchGraphQL<{ me: User }>(ME_QUERY);
      if (data?.me) {
        setUser(data.me);
        localStorage.setItem('bookdrop_user', JSON.stringify(data.me));
      }
    } catch {
      // If fetching fails, let interceptor handle token refresh or ignore
    }
  }, []);

  const switchDemoUser = useCallback(
    async (targetRole: Role) => {
      const creds = DEMO_CREDENTIALS[targetRole];
      try {
        await login(creds.email, creds.pass);
      } catch (err: any) {
        // If login failed (e.g. demo user doesn't exist yet in the database), attempt registration
        if (
          err.message?.toLowerCase().includes('not found') ||
          err.message?.toLowerCase().includes('invalid') ||
          err.message?.toLowerCase().includes('credential')
        ) {
          try {
            await register(creds.email, creds.pass, creds.name);
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }
    },
    [login, register]
  );

  const role = user?.role || null;
  const isMember = role === 'MEMBER';
  const isLibrarian = role === 'LIBRARIAN';
  const isAdmin = role === 'ADMIN';
  const isStaff = isLibrarian || isAdmin;

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        accessToken,
        isLoading,
        isAuthenticated: !!user,
        isMember,
        isLibrarian,
        isAdmin,
        isStaff,
        login,
        register,
        logout,
        switchDemoUser,
        refreshUserProfile,
      }}
    >
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

