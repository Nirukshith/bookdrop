'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatDateTime, getDaysRemaining } from '@/lib/utils';
import {
  BookOpen,
  Clock,
  BookmarkCheck,
  Users,
  AlertTriangle,
  Mail,
  ShieldAlert,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  QrCode,
  DollarSign,
} from 'lucide-react';
import Link from 'next/link';

export default function PatronDashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'loans' | 'holds' | 'queue' | 'fines' | 'notifications'>('loans');

  const [loans, setLoans] = useState<Loan[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [fines, setFines] = useState<MyFine[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [missedPickups, setMissedPickups] = useState<MissedPickupsSummary | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
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
    try {
      setProcessingId(holdId);
      setActionError(null);
      setActionSuccess(null);
      await fetchGraphQL(CANCEL_MY_HOLD_MUTATION, { holdId: parseInt(holdId, 10) });
      setActionSuccess('Hold reservation successfully cancelled.');
      await loadDashboardData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel hold.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelReservation = async (reservationId: string) => {
    try {
      setProcessingId(reservationId);
      setActionError(null);
      setActionSuccess(null);
      await fetchGraphQL(CANCEL_RESERVATION_MUTATION, {
        reservationId: parseInt(reservationId, 10),
        reason: 'Cancelled by patron',
      });
      setActionSuccess('Removed from waiting queue.');
      await loadDashboardData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel queue entry.');
    } finally {
      setProcessingId(null);
    }
  };

  if (isAuthLoading || (!user && isAuthenticated)) {
    return (
      <div className="py-20 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-xs text-slate-500">Authenticating session...</p>
      </div>
    );
  }

  const totalOutstandingFines = fines.reduce(
    (acc, f) => acc + (f.outstandingAmountRs || 0),
    0
  );

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            Welcome, {user?.name}
            <Badge variant="default" className="text-xs font-semibold">
              {user?.role}
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Member ID: {user?.id} • {user?.email}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            isLoading={isLoading}
            className="text-xs gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Link href="/">
            <Button variant="primary" size="sm" className="text-xs gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Browse Catalog
            </Button>
          </Link>
        </div>
      </div>

      {/* Missed Pickups Alert Banner if threshold > 0 */}
      {missedPickups && missedPickups.unassessedCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold">
              Unassessed Missed Pickups: {missedPickups.unassessedCount} of {missedPickups.threshold}
            </span>
            <p className="text-amber-800">
              When a reserved book is not collected before the deadline, it is counted as missed. Reaching{' '}
              {missedPickups.threshold} uncollected holds will trigger an automatic penalty fine.
            </p>
          </div>
        </div>
      )}

      {/* Action Feedback Alerts */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card
          onClick={() => setActiveTab('loans')}
          className={`cursor-pointer transition-all ${
            activeTab === 'loans' ? 'ring-2 ring-indigo-600 shadow-md' : 'hover:border-indigo-200'
          }`}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Active Loans</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{loans.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab('holds')}
          className={`cursor-pointer transition-all ${
            activeTab === 'holds' ? 'ring-2 ring-indigo-600 shadow-md' : 'hover:border-indigo-200'
          }`}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Ready Holds</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{holds.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BookmarkCheck className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab('queue')}
          className={`cursor-pointer transition-all ${
            activeTab === 'queue' ? 'ring-2 ring-indigo-600 shadow-md' : 'hover:border-indigo-200'
          }`}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Waitlists</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{reservations.length}</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveTab('fines')}
          className={`cursor-pointer transition-all ${
            activeTab === 'fines' ? 'ring-2 ring-indigo-600 shadow-md' : 'hover:border-indigo-200'
          }`}
        >
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-medium">Outstanding Fines</div>
              <div
                className={`text-xl font-bold mt-1 ${
                  totalOutstandingFines > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatCurrency(totalOutstandingFines)}
              </div>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                totalOutstandingFines > 0
                  ? 'bg-rose-50 text-rose-600'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('loans')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'loans'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Active Loans ({loans.length})
        </button>

        <button
          onClick={() => setActiveTab('holds')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'holds'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookmarkCheck className="w-4 h-4" />
          Desk Holds ({holds.length})
        </button>

        <button
          onClick={() => setActiveTab('queue')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'queue'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Waitlist Queue ({reservations.length})
        </button>

        <button
          onClick={() => setActiveTab('fines')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'fines'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Fines & Fees ({fines.length})
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'notifications'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          Notifications ({notifications.length})
        </button>
      </div>

      {/* Tab 1: Active Loans */}
      {activeTab === 'loans' && (
        <div className="space-y-4">
          {loans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No active loans</h3>
              <p className="text-xs text-slate-500 mt-1">
                You haven&apos;t checked out any books yet. Browse the catalog to place holds.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loans.map((loan) => {
                const { days, isOverdue, label } = getDaysRemaining(loan.dueAt);
                return (
                  <Card key={loan.id} className="p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-slate-900 text-base">{loan.bookTitle}</h3>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-mono">
                            <QrCode className="w-3.5 h-3.5 text-slate-400" />
                            Barcode: {loan.copyBarcode || 'N/A'}
                          </div>
                        </div>

                        {isOverdue ? (
                          <Badge variant="danger" className="shrink-0">
                            {label}
                          </Badge>
                        ) : days <= 3 ? (
                          <Badge variant="warning" className="shrink-0">
                            {label}
                          </Badge>
                        ) : (
                          <Badge variant="success" className="shrink-0">
                            {label}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4 p-3 bg-slate-50 rounded-lg text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                            Borrowed On
                          </span>
                          <span className="text-slate-700 font-medium">
                            {formatDate(loan.borrowedAt)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                            Due Date
                          </span>
                          <span className="text-slate-700 font-medium">
                            {formatDate(loan.dueAt)}
                          </span>
                        </div>
                      </div>

                      {loan.accruedLateFeeRs > 0 && (
                        <div className="mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                          <span className="font-semibold">Accrued Overdue Fine:</span>
                          <span className="font-bold">{formatCurrency(loan.accruedLateFeeRs)}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                      To return, hand over copy {loan.copyBarcode} at the staff returns desk.
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Holds */}
      {activeTab === 'holds' && (
        <div className="space-y-4">
          {holds.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <BookmarkCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No active holds</h3>
              <p className="text-xs text-slate-500 mt-1">
                You do not have any books waiting at the pickup desk.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {holds.map((hold) => (
                <Card key={hold.id} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">{hold.bookTitle}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 font-mono">
                          <QrCode className="w-3.5 h-3.5 text-slate-400" />
                          Assigned Copy: {hold.copyBarcode || 'Pending'}
                        </div>
                      </div>
                      <Badge variant="success">Ready for Pickup</Badge>
                    </div>

                    <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Reserved On:</span>
                        <span className="font-medium text-slate-800">
                          {formatDateTime(hold.createdAt)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Pickup Deadline:</span>
                        <span className="font-bold text-amber-700">
                          {formatDateTime(hold.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      Show your barcode at the desk to pick up.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={processingId === hold.id}
                      onClick={() => handleCancelHold(hold.id)}
                      className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                    >
                      Cancel Hold
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Queue Reservations */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {reservations.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No active waitlists</h3>
              <p className="text-xs text-slate-500 mt-1">
                You are not currently in line for any popular titles.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reservations.map((res) => (
                <Card key={res.id} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base">
                          {res.book?.title || `Book #${res.bookId}`}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Joined on {formatDate(res.createdAt)}
                        </p>
                      </div>

                      <Badge variant="info" className="text-xs">
                        Queue Position #{res.position ?? '—'}
                      </Badge>
                    </div>

                    <div className="mt-4 p-3 bg-sky-50 rounded-lg text-xs text-sky-800">
                      When a copy is returned, the system will automatically promote your reservation
                      and hold the copy at the desk for you!
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      isLoading={processingId === res.id}
                      onClick={() => handleCancelReservation(res.id)}
                      className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200"
                    >
                      Leave Waitlist
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Fines */}
      {activeTab === 'fines' && (
        <div className="space-y-4">
          {fines.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">Zero Outstanding Fines</h3>
              <p className="text-xs text-slate-500 mt-1">
                Your account is in good standing with no circulation penalties.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Book / Reason</th>
                    <th className="px-4 py-3">Assessed</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fines.map((fine) => (
                    <tr key={fine.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{fine.bookTitle || 'Fine'}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                          Reason: {fine.reason}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {formatCurrency(fine.originalAmountRs)}
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600">
                        {formatCurrency(fine.paidAmountRs)}
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-600">
                        {formatCurrency(fine.outstandingAmountRs)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            fine.status === 'PAID'
                              ? 'success'
                              : fine.status === 'WAIVED'
                              ? 'secondary'
                              : 'danger'
                          }
                        >
                          {fine.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(fine.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                To settle an outstanding fine or request a waiver, visit the circulation desk.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <Mail className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No notifications</h3>
              <p className="text-xs text-slate-500 mt-1">
                Transactional alerts and emails will be logged here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Template / Notification</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Sent At</th>
                    <th className="px-4 py-3">Queued At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notifications.map((notif) => (
                    <tr key={notif.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {notif.template.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            notif.status === 'SENT'
                              ? 'success'
                              : notif.status === 'FAILED'
                              ? 'danger'
                              : 'info'
                          }
                        >
                          {notif.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(notif.sentAt)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateTime(notif.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

