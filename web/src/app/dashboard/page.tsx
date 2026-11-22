'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/components/ui/confirm-modal';
import { markNotificationsRead } from '@/lib/use-unread-notifications';
import {
  Loan,
  Hold,
  Reservation,
  MyFine,
  Notification,
  MissedPickupsSummary,
} from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  MY_LOANS_QUERY,
  MY_HOLDS_QUERY,
  MY_RESERVATIONS_QUERY,
  MY_FINES_QUERY,
  MY_NOTIFICATIONS_QUERY,
  MY_MISSED_PICKUPS_QUERY,
  CANCEL_MY_HOLD_MUTATION,
  CANCEL_RESERVATION_MUTATION,
} from '@/lib/graphql-queries';
import {
  PortalPage,
  PortalHero,
  Notice,
  EmptyState,
  StatusPill,
  ChipTabs,
  BookThumb,
  btnPrimary,
  btnDark,
  btnOutline,
  btnDanger,
} from '@/components/portal/portal-ui';
import { formatCurrency, formatDate, formatDateTime, getDaysRemaining } from '@/lib/utils';
import {
  BookOpen,
  Clock,
  BookmarkCheck,
  Users,
  Mail,
  CheckCircle2,
  RefreshCw,
  Receipt,
  ArrowRight,
  Loader2,
  QrCode,
  ShieldAlert,
  IdCard,
} from 'lucide-react';
import Link from 'next/link';

const DASHBOARD_TABS = ['loans', 'holds', 'queue', 'fines', 'notifications'] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

// useSearchParams needs a Suspense boundary so the page can still be prerendered.
export default function PatronDashboardPage() {
  return (
    <Suspense fallback={null}>
      <PatronDashboard />
    </Suspense>
  );
}

function PatronDashboard() {
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    membershipStatus,
    refreshUserProfile,
  } = useAuth();

  // The active tab lives in the URL (?tab=holds) so the sidebar can deep-link to each section.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: DashboardTab = DASHBOARD_TABS.includes(tabParam as DashboardTab)
    ? (tabParam as DashboardTab)
    : 'loans';
  const setActiveTab = (tab: DashboardTab) =>
    router.replace(tab === 'loans' ? '/dashboard' : `/dashboard?tab=${tab}`, { scroll: false });

  const [loans, setLoans] = useState<Loan[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const { confirm, notify, confirmDialog } = useConfirm();
  const [fines, setFines] = useState<MyFine[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Notifications that were unread when the member opened the tab: highlighted as "New" for this visit.
  const [newNotificationIds, setNewNotificationIds] = useState<Set<string>>(new Set());
  const [missedPickups, setMissedPickups] = useState<MissedPickupsSummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  // Skeletons only on the first load; later refreshes keep the current data on screen.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadDashboardData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoading(true);
      setActionError(null);

      const [loansRes, holdsRes, resRes, finesRes, notifRes, missedRes] = await Promise.all([
        fetchGraphQL<{ myLoans: Loan[] }>(MY_LOANS_QUERY, { status: 'ACTIVE' }).catch(() => ({ myLoans: [] })),
        fetchGraphQL<{ myHolds: Hold[] }>(MY_HOLDS_QUERY, { status: 'ACTIVE' }).catch(() => ({ myHolds: [] })),
        fetchGraphQL<{ myReservations: Reservation[] }>(MY_RESERVATIONS_QUERY).catch(() => ({ myReservations: [] })),
        fetchGraphQL<{ myFines: MyFine[] }>(MY_FINES_QUERY).catch(() => ({ myFines: [] })),
        fetchGraphQL<{ myNotifications: Notification[] }>(MY_NOTIFICATIONS_QUERY, { pagination: { take: 20 } }).catch(() => ({ myNotifications: [] })),
        fetchGraphQL<{ myMissedPickups: MissedPickupsSummary }>(MY_MISSED_PICKUPS_QUERY).catch(() => ({ myMissedPickups: null })),
      ]);

      setLoans(loansRes.myLoans || []);
      setHolds(holdsRes.myHolds || []);
      setReservations(resRes.myReservations || []);
      setFines(finesRes.myFines || []);
      setNotifications(notifRes.myNotifications || []);
      setMissedPickups(missedRes.myMissedPickups || null);
    } catch (err: any) {
      setActionError(err.message || 'Error loading dashboard data');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/login');
      return;
    }
    if (isAuthenticated) {
      loadDashboardData();
    }
  }, [isAuthenticated, isAuthLoading, router, loadDashboardData]);

  const handleCancelHold = async (holdId: string) => {
    const title = holds.find((h) => h.id === holdId)?.bookTitle;
    const ok = await confirm({
      title: 'Cancel this hold?',
      message: (
        <>
          {title ? <>Your reserved copy of <span className="font-semibold text-black/80">{title}</span> will go back on the shelf. </> : 'Your reserved copy will go back on the shelf. '}
          You&apos;d need to place a new hold to get it again.
        </>
      ),
      tone: 'danger',
      confirmText: 'Cancel hold',
      cancelText: 'Keep hold',
    });
    if (ok === null) return;
    try {
      setProcessingId(holdId);
      setActionError(null);
      await fetchGraphQL(CANCEL_MY_HOLD_MUTATION, { holdId: parseInt(holdId, 10) });
      await loadDashboardData();
      await notify({
        title: 'Hold cancelled',
        message: title ? <><span className="font-semibold text-black/80">{title}</span> is back on the shelf for other readers.</> : 'The copy is back on the shelf for other readers.',
      });
    } catch (err: any) {
      await notify({ title: 'Couldn’t cancel the hold', message: err.message || 'Please try again.', tone: 'danger' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    const res = reservations.find((r) => r.id === reservationId);
    const title = res?.book?.title;
    const ok = await confirm({
      title: 'Leave the waitlist?',
      message: (
        <>
          {title ? <>You&apos;ll lose your place in line for <span className="font-semibold text-black/80">{title}</span>. </> : <>You&apos;ll lose your place in line. </>}
          Rejoining puts you at the back of the queue.
        </>
      ),
      tone: 'danger',
      confirmText: 'Leave waitlist',
      cancelText: 'Stay in line',
    });
    if (ok === null) return;
    try {
      setProcessingId(reservationId);
      setActionError(null);
      await fetchGraphQL(CANCEL_RESERVATION_MUTATION, {
        reservationId: parseInt(reservationId, 10),
        reason: 'Cancelled by patron',
      });
      await loadDashboardData();
      await notify({
        title: 'You left the waitlist',
        message: title ? <>You&apos;re no longer waiting for <span className="font-semibold text-black/80">{title}</span>.</> : 'You’re no longer on this waitlist.',
      });
    } catch (err: any) {
      await notify({ title: 'Couldn’t leave the waitlist', message: err.message || 'Please try again.', tone: 'danger' });
    } finally {
      setProcessingId(null);
    }
  };

  // Opening the Notifications tab marks everything read (clears the sidebar badge).
  useEffect(() => {
    if (activeTab !== 'notifications') return;
    const unread = notifications.filter((n) => !n.readAt);
    if (unread.length === 0) return;
    setNewNotificationIds((prev) => new Set([...Array.from(prev), ...unread.map((n) => n.id)]));
    const readAt = new Date().toISOString();
    markNotificationsRead()
      .then(() => setNotifications((list) => list.map((n) => (n.readAt ? n : { ...n, readAt }))))
      .catch(() => {
        // Leave them unread; the badge stays until the next successful visit.
      });
  }, [activeTab, notifications]);

  if (isAuthLoading || (!user && isAuthenticated)) {
    return (
      <div className="py-24 text-center space-y-3 font-body">
        <Loader2 className="w-7 h-7 text-black/50 animate-spin mx-auto" />
        <p className="text-sm text-black/55">Signing you in…</p>
      </div>
    );
  }

  const totalOutstandingFines = fines.reduce((acc, f) => acc + (f.outstandingAmountRs || 0), 0);
  const firstName = user?.name?.split(' ')[0] || 'reader';

  const stats: { id: DashboardTab; label: string; value: string | number; hint: string; alert?: boolean }[] = [
    { id: 'loans', label: 'On loan', value: loans.length, hint: loans.length === 1 ? 'book checked out' : 'books checked out' },
    { id: 'holds', label: 'Ready to collect', value: holds.length, hint: 'at the pickup desk' },
    { id: 'queue', label: 'Waitlists', value: reservations.length, hint: 'titles you’re in line for' },
    { id: 'fines', label: 'Fines due', value: formatCurrency(totalOutstandingFines), hint: totalOutstandingFines > 0 ? 'settle at the desk' : 'all clear', alert: totalOutstandingFines > 0 },
  ];

  const tabs = [
    { id: 'loans' as const, label: 'Loans', count: loans.length, icon: Clock },
    { id: 'holds' as const, label: 'Desk holds', count: holds.length, icon: BookmarkCheck },
    { id: 'queue' as const, label: 'Waitlists', count: reservations.length, icon: Users },
    { id: 'fines' as const, label: 'Fines & fees', count: fines.length, icon: Receipt },
    { id: 'notifications' as const, label: 'Notifications', count: notifications.length, icon: Mail },
  ];

  const listSkeleton = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-4 rounded-2xl border border-black/[0.08] bg-white p-5 animate-pulse">
          <div className="w-16 h-24 rounded bg-[#F4EFDF]" />
          <div className="flex-1 space-y-3 pt-1">
            <div className="h-4 bg-black/[0.08] rounded w-2/3" />
            <div className="h-3 bg-black/[0.06] rounded w-1/3" />
            <div className="h-10 bg-black/[0.04] rounded" />
          </div>
        </div>
      ))}
    </div>
  );

  const browseLink = (
    <Link href="/catalog" className={btnPrimary}>
      Browse the catalog <ArrowRight className="w-4 h-4" />
    </Link>
  );

  return (
    <PortalPage>
      {confirmDialog}
      {/* ── Header ── */}
      <PortalHero
        eyebrow="Member dashboard"
        title={`Welcome back, ${firstName}`}
        description={
          <p>
            {user?.membershipNumber ? (
              <span className="inline-flex items-center gap-1.5">
                <IdCard className="w-4 h-4 text-black/40" />
                <span className="font-mono tracking-wide">{user.membershipNumber}</span>
              </span>
            ) : (
              <>Member #{user?.id}</>
            )}{' '}
            <span className="text-black/30 px-1">·</span> {user?.email}
          </p>
        }
        actions={
          <>
            <button
              onClick={() => {
                refreshUserProfile();
                loadDashboardData();
              }}
              disabled={isLoading}
              className={btnOutline}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link href="/catalog" className={btnDark}>
              <BookOpen className="w-4 h-4" />
              Browse catalog
            </Link>
          </>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => {
            const isActive = activeTab === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveTab(s.id)}
                aria-pressed={isActive}
                className={`text-left rounded-2xl border px-4 py-4 transition-all ${
                  isActive ? 'bg-white border-black shadow-sm' : 'bg-white/55 border-black/[0.06] hover:bg-white/85'
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/55">{s.label}</span>
                <span className={`block font-heading text-[1.9rem] leading-none mt-2 tabular-nums ${s.alert ? 'text-rose-700' : ''}`}>
                  {hasLoaded ? s.value : '–'}
                </span>
                <span className="block text-xs text-black/50 mt-1.5">{s.hint}</span>
              </button>
            );
          })}
        </div>
      </PortalHero>

      {/* ── Membership approval status ── */}
      {membershipStatus === 'PENDING' && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-px" />
          <div>
            <p className="font-semibold">Your membership is awaiting approval</p>
            <p className="mt-0.5 text-amber-900/80">
              An admin will verify membership number{' '}
              <span className="font-mono font-semibold">{user?.membershipNumber}</span> against library
              records. Until then you can browse the catalog, but you can&apos;t place holds, join
              waitlists or borrow books. Use Refresh to check for updates.
            </p>
          </div>
        </div>
      )}
      {membershipStatus === 'REJECTED' && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-px" />
          <div>
            <p className="font-semibold">Your membership application was not approved</p>
            <p className="mt-0.5 text-rose-900/80">
              We couldn&apos;t verify membership number{' '}
              <span className="font-mono font-semibold">{user?.membershipNumber}</span>. Please contact the
              library desk to resolve it.
            </p>
          </div>
        </div>
      )}

      {/* ── Notices ── */}
      {missedPickups && missedPickups.unassessedCount > 0 && (
        <Notice tone="warning" title={`${missedPickups.unassessedCount} of ${missedPickups.threshold} missed pickups`}>
          A hold that isn’t collected before its deadline counts as missed. Reaching {missedPickups.threshold} adds an
          automatic penalty fine to your account.
        </Notice>
      )}
      {actionError && <Notice tone="error" onDismiss={() => setActionError(null)}>{actionError}</Notice>}

      {/* ── Section tabs ── */}
      <ChipTabs label="Dashboard sections" tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* ── Loans ── */}
      {activeTab === 'loans' &&
        (!hasLoaded ? listSkeleton : loans.length === 0 ? (
          <EmptyState icon={Clock} title="No books on loan" action={browseLink}>
            Place a hold in the catalog, then collect it at the desk to start a loan.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loans.map((loan) => {
              const { days, isOverdue, label } = getDaysRemaining(loan.dueAt);
              const tone = isOverdue ? 'red' : days <= 3 ? 'amber' : 'green';
              return (
                <article key={loan.id} className="flex gap-5 rounded-2xl border border-black/[0.08] bg-white p-5">
                  <BookThumb id={loan.bookId} title={loan.bookTitle} className="w-[72px]" />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-bold leading-snug line-clamp-2">{loan.bookTitle}</h3>
                      <StatusPill tone={tone}>{label}</StatusPill>
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-black/50 font-mono">
                      <QrCode className="w-3.5 h-3.5" />{loan.copyBarcode || 'N/A'}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">Borrowed</dt>
                        <dd className="font-medium mt-0.5">{formatDate(loan.borrowedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">Due</dt>
                        <dd className={`font-medium mt-0.5 ${isOverdue ? 'text-rose-700' : ''}`}>{formatDate(loan.dueAt)}</dd>
                      </div>
                    </dl>
                    {loan.accruedLateFeeRs > 0 && (
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                        <span>Late fee so far</span>
                        <span className="font-bold tabular-nums">{formatCurrency(loan.accruedLateFeeRs)}</span>
                      </div>
                    )}
                    <p className="mt-auto pt-4 text-xs text-black/45">Return this copy at any returns desk.</p>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

      {/* ── Holds ── */}
      {activeTab === 'holds' &&
        (!hasLoaded ? listSkeleton : holds.length === 0 ? (
          <EmptyState icon={BookmarkCheck} title="Nothing waiting at the desk" action={browseLink}>
            When you place a hold, the copy is set aside here for you to collect.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {holds.map((hold) => (
              <article key={hold.id} className="flex gap-5 rounded-2xl border border-black/[0.08] bg-white p-5">
                <BookThumb id={hold.bookId} title={hold.bookTitle} className="w-[72px]" />
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold leading-snug line-clamp-2">{hold.bookTitle}</h3>
                    <StatusPill tone="green">Ready</StatusPill>
                  </div>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-black/50 font-mono">
                    <QrCode className="w-3.5 h-3.5" />{hold.copyBarcode || 'Copy pending'}
                  </p>
                  <div className="mt-4 rounded-xl bg-[#FFF7D1] border border-brandYellow/60 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/55">Collect by</p>
                    <p className="font-semibold mt-0.5">{formatDateTime(hold.expiresAt)}</p>
                  </div>
                  <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-black/45">Placed {formatDate(hold.createdAt)}</span>
                    <button
                      onClick={() => handleCancelHold(hold.id)}
                      disabled={processingId === hold.id}
                      className={`${btnDanger} px-4 py-2 text-xs`}
                    >
                      {processingId === hold.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Cancel hold
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ))}

      {/* ── Waitlists ── */}
      {activeTab === 'queue' &&
        (!hasLoaded ? listSkeleton : reservations.length === 0 ? (
          <EmptyState icon={Users} title="You’re not on any waitlists" action={browseLink}>
            When every copy of a title is out, join its waitlist from the catalog.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reservations.map((res) => {
              const title = res.book?.title || `Book #${res.bookId}`;
              return (
                <article key={res.id} className="flex gap-5 rounded-2xl border border-black/[0.08] bg-white p-5">
                  <BookThumb
                    id={res.bookId}
                    title={title}
                    author={res.book?.authors?.[0]?.name}
                    year={res.book?.publishedYear}
                    className="w-[72px]"
                  />
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold leading-snug line-clamp-2">{title}</h3>
                        {res.book?.authors?.length ? (
                          <p className="text-sm text-black/55 mt-0.5 line-clamp-1">{res.book.authors.map((a) => a.name).join(', ')}</p>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block font-heading text-[1.9rem] leading-none tabular-nums">#{res.position ?? '–'}</span>
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50 mt-1">in line</span>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-black/60 leading-relaxed">
                      When a copy comes back, it’s held at the desk for you automatically and we’ll let you know.
                    </p>
                    <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-black/45">Joined {formatDate(res.createdAt)}</span>
                      <button
                        onClick={() => handleCancelReservation(res.id)}
                        disabled={processingId === res.id}
                        className={`${btnDanger} px-4 py-2 text-xs`}
                      >
                        {processingId === res.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Leave waitlist
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ))}

      {/* ── Fines ── */}
      {activeTab === 'fines' &&
        (!hasLoaded ? listSkeleton : fines.length === 0 ? (
          <EmptyState icon={CheckCircle2} tone="good" title="No fines">
            Your account is in good standing.
          </EmptyState>
        ) : (
          <div className="rounded-2xl border border-black/[0.08] bg-white overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 px-6 py-5 border-b border-black/[0.08]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">Outstanding</p>
                <p className={`font-heading text-[2.2rem] leading-none mt-1.5 tabular-nums ${totalOutstandingFines > 0 ? 'text-rose-700' : ''}`}>
                  {formatCurrency(totalOutstandingFines)}
                </p>
              </div>
              <p className="text-sm text-black/55 max-w-xs">Pay or request a waiver at the circulation desk.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-[#FBF8EF] text-[11px] font-semibold uppercase tracking-[0.12em] text-black/50">
                  <tr>
                    <th className="px-6 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold text-right">Assessed</th>
                    <th className="px-4 py-3 font-semibold text-right">Paid</th>
                    <th className="px-4 py-3 font-semibold text-right">Due</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-6 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {fines.map((fine) => (
                    <tr key={fine.id} className="hover:bg-[#FBF8EF]/70">
                      <td className="px-6 py-3.5">
                        <div className="font-semibold">{fine.bookTitle || 'Fine'}</div>
                        <div className="text-xs text-black/50 capitalize">{fine.reason.replace(/_/g, ' ').toLowerCase()}</div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatCurrency(fine.originalAmountRs)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-emerald-700">{formatCurrency(fine.paidAmountRs)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums font-semibold">{formatCurrency(fine.outstandingAmountRs)}</td>
                      <td className="px-4 py-3.5">
                        <StatusPill tone={fine.status === 'PAID' ? 'green' : fine.status === 'WAIVED' ? 'neutral' : fine.status === 'PARTIALLY_PAID' ? 'amber' : 'red'}>
                          {fine.status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        </StatusPill>
                      </td>
                      <td className="px-6 py-3.5 text-black/55 whitespace-nowrap">{formatDate(fine.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {/* ── Notifications ── */}
      {activeTab === 'notifications' &&
        (!hasLoaded ? listSkeleton : notifications.length === 0 ? (
          <EmptyState icon={Mail} title="No notifications yet">
            Pickup reminders, due-date alerts and waitlist updates will appear here.
          </EmptyState>
        ) : (
          <ul className="rounded-2xl border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`flex items-center gap-4 px-5 py-4 ${newNotificationIds.has(n.id) ? 'bg-amber-50/60' : ''}`}
              >
                <div className="w-10 h-10 shrink-0 rounded-full bg-[#F4EFDF] flex items-center justify-center text-black/60">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="capitalize truncate">{n.template.replace(/_/g, ' ').toLowerCase()}</span>
                    {newNotificationIds.has(n.id) && (
                      <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white">
                        New
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-black/50 mt-0.5">{formatDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        ))}
    </PortalPage>
  );
}
