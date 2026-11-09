'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Role } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, LogIn, AlertCircle, Sparkles, Shield, User, Award } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, switchDemoUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const user = await login(email, password);
      if (user.role === 'ADMIN' || user.role === 'LIBRARIAN') {
        router.push('/staff/desk');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (role: Role) => {
    try {
      setIsLoading(true);
      setError(null);
      await switchDemoUser(role);
      if (role === 'ADMIN' || role === 'LIBRARIAN') {
        router.push('/staff/desk');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(`Demo login failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto shadow-lg shadow-indigo-200 mb-3">
          <BookOpen className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Sign In to Bookdrop
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Access your library account, holds, active loans, and fines.
        </p>
      </div>

      <Card className="shadow-lg border-slate-200">
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-base">Enter Credentials</CardTitle>
          <CardDescription>Use your registered email and password to log in.</CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-0 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full justify-center text-sm py-2.5 mt-2"
            >
              <LogIn className="w-4 h-4 mr-1.5" />
              Sign In
            </Button>
          </form>

          {/* 1-Click Demo Login Personas */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Instant 1-Click Demo Accounts</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDemoLogin('MEMBER')}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left flex flex-col justify-between"
              >
                <User className="w-4 h-4 text-indigo-600 mb-1" />
                <span className="text-xs font-bold text-slate-800">Patron</span>
                <span className="text-[10px] text-slate-400">Holds & Loans</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDemoLogin('LIBRARIAN')}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50 hover:border-amber-300 transition-colors text-left flex flex-col justify-between"
              >
                <Award className="w-4 h-4 text-amber-600 mb-1" />
                <span className="text-xs font-bold text-slate-800">Librarian</span>
                <span className="text-[10px] text-slate-400">Circulation Desk</span>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleDemoLogin('ADMIN')}
                className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-rose-50 hover:border-rose-300 transition-colors text-left flex flex-col justify-between"
              >
                <Shield className="w-4 h-4 text-rose-600 mb-1" />
                <span className="text-xs font-bold text-slate-800">Admin</span>
                <span className="text-[10px] text-slate-400">Leases & Outbox</span>
              </button>
            </div>
          </div>

          <div className="text-center pt-2 text-xs text-slate-500">
            Don&apos;t have an account yet?{' '}
            <Link href="/register" className="font-semibold text-indigo-600 hover:text-indigo-700">
              Register here
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

