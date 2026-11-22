'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/components/ui/confirm-modal';

/**
 * Asks "Sign out of Bookdrop?" (shared ConfirmModal) before logging out.
 *
 *   const { requestLogout, confirmLogoutDialog } = useConfirmLogout();
 *   <button onClick={() => requestLogout()}>Log out</button>
 *   {confirmLogoutDialog}
 *
 * `beforeLogout` runs only once the user confirms (e.g. closing a mobile drawer).
 * After signing out the user is taken to the login page.
 */
export function useConfirmLogout() {
  const { logout, user } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();

  const requestLogout = useCallback(
    async (beforeLogout?: () => void) => {
      const ok = await confirm({
        title: 'Sign out of Bookdrop?',
        message: (
          <>
            {user?.name ? (
              <>
                You&apos;re signed in as <span className="font-semibold text-black/80">{user.name}</span>.{' '}
              </>
            ) : null}
            You&apos;ll need to sign in again to manage your holds, loans and waitlists.
          </>
        ),
        tone: 'danger',
        icon: LogOut,
        confirmText: 'Sign out',
        cancelText: 'Stay signed in',
      });
      if (ok === null) return;
      beforeLogout?.();
      await logout();
      router.replace('/login');
    },
    [confirm, logout, router, user?.name],
  );

  return { requestLogout, confirmLogoutDialog: confirmDialog };
}
