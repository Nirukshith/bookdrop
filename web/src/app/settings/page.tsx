'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useConfirmLogout } from '@/components/auth/confirm-logout';
import { PortalPage, PortalHero, Panel, MetaRow, StatusPill, btnDanger } from '@/components/portal/portal-ui';
import { LogOut, UserCircle2, ShieldCheck, Check, Lock } from 'lucide-react';

const ROLE_LABEL: Record<string, string> = { MEMBER: 'Member', LIBRARIAN: 'Librarian', ADMIN: 'Administrator' };

const ROLE_ACCESS: Record<string, string[]> = {
  MEMBER: [
    'Browse and search the catalog',
    'Place holds and join waitlists for books',
    'Track your loans, due dates and fines',
    'Receive pickup and due-date notifications',
  ],
  LIBRARIAN: [
    'Browse the catalog and patron dashboard',
    'Fulfill holds and walk-in checkouts at the desk',
    'Check in returns and record inspections',
    'Manage inventory copies, barcodes and titles',
  ],
  ADMIN: [
    'Everything a librarian can do',
    'Monitor job leases and the retry outbox',
    'Manage the fines desk',
  ],
};

export default function SettingsPage() {
  const { user, role, isLoading } = useAuth();
  const { requestLogout, confirmLogoutDialog } = useConfirmLogout();

  if (isLoading) return null;

  if (!user) {
    return (
      <PortalPage>
        <p className="text-sm text-black/55">Sign in to view your account settings.</p>
      </PortalPage>
    );
  }

  const roleLabel = (role && ROLE_LABEL[role]) || role || 'Member';

  return (
    <PortalPage className="max-w-4xl">
      {confirmLogoutDialog}
      <PortalHero eyebrow="Account" title="Settings" description="Your profile, what you can do in Bookdrop, and this session." />

      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        {/* Profile */}
        <Panel title="Profile" icon={UserCircle2} description="Managed by a library administrator." className="md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex items-center gap-4 sm:w-64 shrink-0">
              <div className="w-14 h-14 rounded-full bg-brandGreen text-black flex items-center justify-center font-heading text-2xl">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-bold truncate">{user.name}</p>
                <StatusPill tone="ink" className="mt-1">{roleLabel}</StatusPill>
              </div>
            </div>
            <dl className="flex-1 divide-y divide-black/[0.08] border-y border-black/[0.08]">
              <MetaRow label="Name">{user.name}</MetaRow>
              <MetaRow label="Email">{user.email}</MetaRow>
              <MetaRow label="Member ID">#{user.id}</MetaRow>
            </dl>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs text-black/50">
            <Lock className="w-3.5 h-3.5" />
            To change your name or email, ask at the circulation desk.
          </p>
        </Panel>

        {/* Access */}
        {role && ROLE_ACCESS[role] && (
          <Panel title="What you can do" icon={ShieldCheck} description={`As a ${roleLabel.toLowerCase()}.`}>
            <ul className="space-y-2.5 text-sm">
              {ROLE_ACCESS[role].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-brandGreen flex items-center justify-center">
                    <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {/* Session */}
        <Panel title="Session" icon={LogOut} description="Sign out of Bookdrop on this device.">
          <button onClick={() => requestLogout()} className={btnDanger}>
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </Panel>
      </div>
    </PortalPage>
  );
}
