'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchGraphQL } from './graphql-client';

const UNREAD_COUNT_QUERY = `query MyUnreadNotificationCount { myUnreadNotificationCount }`;
const MARK_READ_MUTATION = `mutation MarkMyNotificationsRead { markMyNotificationsRead }`;

/** Fired after notifications are marked read so every badge refreshes at once. */
const NOTIFICATIONS_CHANGED_EVENT = 'bookdrop:notifications-changed';
const POLL_MS = 30_000;

/**
 * Unread notification count for the signed-in member. Polls every 30s, and
 * refreshes when the tab regains focus or notifications are marked read.
 */
export function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const data = await fetchGraphQL<{ myUnreadNotificationCount: number }>(UNREAD_COUNT_QUERY);
      setCount(data.myUnreadNotificationCount ?? 0);
    } catch {
      // Keep the last known count; the next poll will try again.
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
    if (!enabled) return;
    const timer = window.setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}

/** Marks all of the member's notifications read and updates every badge. */
export async function markNotificationsRead(): Promise<void> {
  await fetchGraphQL(MARK_READ_MUTATION);
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
