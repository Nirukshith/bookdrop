'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink } from '@/components/page-transition';
import { useAuth } from '@/lib/auth-context';
import { AuthField, AuthLayout } from '@/components/auth/auth-layout';
import { Notice, btnPrimary } from '@/components/portal/portal-ui';
import { ArrowRight, IdCard, Loader2, Mail, User } from 'lucide-react';

const MEMBERSHIP_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,32}$/;

const STEPS = [
  { title: 'Register', text: 'Create your account with the number on your library card.' },
  { title: 'We verify it', text: 'A librarian checks your membership number against our records.' },
  { title: 'Start borrowing', text: 'Once approved, place holds, join waitlists and borrow. We’ll email you.' },
];

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [membershipNumber, setMembershipNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !membershipNumber) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!MEMBERSHIP_NUMBER_PATTERN.test(membershipNumber.trim())) {
      setError('Membership number must be 4-32 letters, digits or hyphens, as printed on your library card.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await register(email, password, name, membershipNumber.trim());
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. The email or membership number might already be registered.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Become a member"
      title={<>Your next read is waiting</>}
      description="Join Bookdrop with your library card. It's free, and you can browse the whole collection straight away."
      aside={
        <ol className="space-y-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black font-heading text-sm text-white tabular-nums">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <p className="text-sm font-bold">{step.title}</p>
                <p className="text-sm text-black/65 leading-snug">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      }
      formTitle="Create your account"
      formDescription="You'll need the membership number printed on your library card."
      footer={
        <>
          Already a member?{' '}
          <TransitionLink href="/login" className="font-semibold text-black underline decoration-brandGreenDeep decoration-2 underline-offset-4 hover:decoration-black">
            Sign in
          </TransitionLink>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <Notice tone="error" onDismiss={() => setError(null)}>
            {error}
          </Notice>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField
            label="Full name"
            icon={User}
            required
            autoComplete="name"
            value={name}
            onChange={setName}
            placeholder="Jane Doe"
          />
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
            label="Library membership number"
            icon={IdCard}
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            value={membershipNumber}
            onChange={(v) => setMembershipNumber(v.toUpperCase())}
            placeholder="e.g. LIB-004217"
            inputClassName="font-mono tracking-wide"
            hint="Printed on your library card. We verify it before you can borrow."
          />
          <AuthField
            label="Password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
          />

          <button type="submit" disabled={isLoading} className={`${btnPrimary} mt-2 w-full py-3 text-[15px]`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoading ? 'Creating account…' : 'Create account'}
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-center text-xs leading-relaxed text-black/50">
            New accounts need admin approval before borrowing. You&apos;ll get an email as soon as
            yours is approved.
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
