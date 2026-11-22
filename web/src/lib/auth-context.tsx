'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Role, MembershipStatus } from './types';
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
  /** Membership approval state (staff accounts are always APPROVED). */
  membershipStatus: MembershipStatus | null;
  /** True when the user may place holds, join waitlists and borrow. */
  canBorrow: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (
    email: string,
    password: string,
    name: string,
    membershipNumber: string
  ) => Promise<User>;
  logout: () => Promise<void>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    async (
      email: string,
      password: string,
      name: string,
      membershipNumber: string
    ): Promise<User> => {
      const data = await fetchGraphQL<{
        register: { accessToken: string; refreshToken: string; user: User };
      }>(REGISTER_MUTATION, { input: { email, password, name, membershipNumber } });

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

  // Re-fetch the profile once on load so membership status is current (e.g. an
  // admin approved the member since the profile was saved in localStorage).
  useEffect(() => {
    if (accessToken) {
      refreshUserProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken !== null]);

  const role = user?.role || null;
  const isMember = role === 'MEMBER';
  const isLibrarian = role === 'LIBRARIAN';
  const isAdmin = role === 'ADMIN';
  const isStaff = isLibrarian || isAdmin;
  const membershipStatus: MembershipStatus | null = user
    ? user.membershipStatus ?? 'APPROVED'
    : null;
  const canBorrow = !!user && (isStaff || membershipStatus === 'APPROVED');

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
        membershipStatus,
        canBorrow,
        login,
        register,
        logout,
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

