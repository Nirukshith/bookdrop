'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AuthField, AuthLayout } from '@/components/auth/auth-layout';
import { Notice, btnPrimary } from '@/components/portal/portal-ui';
import { ArrowRight, BookmarkCheck, Clock, Library, Loader2, Mail, ShieldCheck, Users } from 'lucide-react';

// Development-only quick-fill for the seeded demo accounts (see services/library-core/prisma/seed.ts).
// NODE_ENV is inlined at build time, so this block is stripped from production bundles.
const DEV_ACCOUNTS =
  process.env.NODE_ENV === 'development'
    ? [
        {
          label: 'Admin',
          icon: ShieldCheck,
          email: 'admin@bookdrop.local',
          password: 'AdminPassword123!',
        },
        {
          label: 'Librarian',
          icon: Library,
          email: 'librarian@bookdrop.local',
          password: 'LibrarianPassword123!',
        },
      ]
    : [];

const PERKS = [
  { icon: BookmarkCheck, text: 'Track your holds and pickup deadlines' },
  { icon: Clock, text: 'See due dates before anything is late' },
  { icon: Users, text: 'Check your place in every waitlist' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

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

  return (
    <AuthLayout
      eyebrow="Member sign in"
      title={<>Welcome back, reader</>}
      description="Pick up where you left off: your loans, holds and waitlists are all in one place."
      aside={
        <ul className="space-y-2.5">
          {PERKS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm font-medium text-black/75">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 border border-black/[0.07]">
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      }
      formTitle="Sign in"
      formDescription="Use the email and password you registered with."
      footer={
        <>
          New to Bookdrop?{' '}
          <Link href="/register" className="font-semibold text-black underline decoration-brandYellowWarm decoration-2 underline-offset-4 hover:decoration-black">
            Become a member
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <Notice tone="error" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}

        {DEV_ACCOUNTS.length > 0 && (
          <div className="rounded-2xl border border-dashed border-black/15 bg-[#FBF8EF] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">
              Dev only · fill credentials
            </p>
            <div className="flex gap-2">
              {DEV_ACCOUNTS.map(({ label, icon: Icon, email: devEmail, password: devPassword }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setEmail(devEmail);
                    setPassword(devPassword);
                    setError(null);
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold hover:border-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField
            label="Email address"
            type="email"
            icon={Mail}
            required
            autoComplete="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
          />
          <AuthField
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            placeholder="Your password"
          />

          <button type="submit" disabled={isLoading} className={`${btnPrimary} mt-2 w-full py-3 text-[15px]`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoading ? 'Signing in…' : 'Sign in'}
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
