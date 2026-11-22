'use client';

import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useConfirm, ModalDetails } from '@/components/ui/confirm-modal';
import { describeDeskError, type CirculationNotice } from '@/lib/circulation-errors';
import { PickupDeskHold, Loan } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  PICKUP_DESK_HOLDS_QUERY,
  CONFIRM_PICKUP_MUTATION,
  CHECKOUT_COPY_MUTATION,
} from '@/lib/graphql-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  PackageCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  QrCode,
  User,
  BookOpen,
  ArrowRight,
  LogIn,
  RefreshCw,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export default function StaffDeskPage() {
  const { user, isStaff } = useAuth();
  const { confirm, notify, confirmDialog } = useConfirm();

  /** Refused checkouts (limits, fines, overdue, membership) shown in the warning modal. */
  const showNotice = (notice: CirculationNotice) =>
    confirm({ title: notice.title, message: notice.message, tone: notice.tone, confirmText: 'Got it', hideCancel: true });

  const [deskMode, setDeskMode] = useState<'pickup' | 'checkout'>('pickup');

  // Pickup desk state
  const [searchBarcode, setSearchBarcode] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [holds, setHolds] = useState<PickupDeskHold[]>([]);
  const [isLoadingHolds, setIsLoadingHolds] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [fulfillingHoldId, setFulfillingHoldId] = useState<string | null>(null);

  // Walk-in checkout state
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutBarcode, setCheckoutBarcode] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loadPickupHolds = useCallback(async () => {
    try {
      setIsLoadingHolds(true);
      setPickupError(null);
      const data = await fetchGraphQL<{ pickupDeskHolds: PickupDeskHold[] }>(
        PICKUP_DESK_HOLDS_QUERY,
        {
          copyBarcode: searchBarcode.trim() || undefined,
          memberEmail: searchEmail.trim() || undefined,
        }
      );
      setHolds(data.pickupDeskHolds || []);
    } catch (err: any) {
      setPickupError(err.message || 'Could not load pickup holds.');
    } finally {
      setIsLoadingHolds(false);
    }
  }, [searchBarcode, searchEmail]);

  useEffect(() => {
    loadPickupHolds();
  }, [loadPickupHolds]);

  const handleConfirmPickup = async (hold: PickupDeskHold) => {
    const ok = await confirm({
      title: 'Hand over this copy?',
      message: (
        <>
          Check out <span className="font-semibold text-black/80">{hold.bookTitle}</span> (copy{' '}
          <span className="font-mono">{hold.copyBarcode}</span>) to{' '}
          <span className="font-semibold text-black/80">{hold.memberName}</span>. This starts their loan.
        </>
      ),
      tone: 'success',
      confirmText: 'Confirm pickup',
    });
    if (ok === null) return;
    try {
      setFulfillingHoldId(hold.id);
      setPickupError(null);

      const res = await fetchGraphQL<{ confirmPickup: Loan }>(CONFIRM_PICKUP_MUTATION, {
        copyBarcode: hold.copyBarcode,
        holdId: parseInt(hold.id, 10),
      });

      loadPickupHolds();
      await notify({
        title: 'Handed over',
        timer: 4500,
        message: (
          <>
            The loan for <span className="font-semibold text-black/80">{hold.memberName}</span> is now active.
            <ModalDetails
              rows={[
                { label: 'Book', value: res.confirmPickup.bookTitle },
                { label: 'Copy', value: <span className="font-mono">{res.confirmPickup.copyBarcode}</span> },
                { label: 'Due', value: formatDate(res.confirmPickup.dueAt) },
              ]}
            />
          </>
        ),
      });
    } catch (err: any) {
      await showNotice(describeDeskError(err, 'Pickup failed'));
    } finally {
      setFulfillingHoldId(null);
    }
  };

  const handleWalkInCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutEmail || !checkoutBarcode) {
      setCheckoutError('Please provide both member email and copy barcode.');
      return;
    }

    const ok = await confirm({
      title: 'Check out this copy?',
      message: (
        <>
          Lend copy <span className="font-mono font-semibold text-black/80">{checkoutBarcode.trim()}</span> to{' '}
          <span className="font-semibold text-black/80">{checkoutEmail.trim()}</span>. This starts a new loan.
        </>
      ),
      tone: 'success',
      confirmText: 'Check out',
    });
    if (ok === null) return;

    try {
      setIsCheckingOut(true);
      setCheckoutError(null);

      const res = await fetchGraphQL<{ checkoutCopy: Loan }>(CHECKOUT_COPY_MUTATION, {
        memberEmail: checkoutEmail.trim(),
        copyBarcode: checkoutBarcode.trim(),
      });

      setCheckoutBarcode('');
      await notify({
        title: 'Loan started',
        timer: 4500,
        message: (
          <>
            Walk-in checkout for <span className="font-semibold text-black/80">{checkoutEmail.trim()}</span> is complete.
            <ModalDetails
              rows={[
                { label: 'Book', value: res.checkoutCopy.bookTitle },
                { label: 'Copy', value: <span className="font-mono">{res.checkoutCopy.copyBarcode}</span> },
                { label: 'Due', value: formatDate(res.checkoutCopy.dueAt) },
              ]}
            />
          </>
        ),
      });
    } catch (err: any) {
      await showNotice(describeDeskError(err, 'Checkout failed'));
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="space-y-8">
      {confirmDialog}
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Circulation Desk
            </h1>
            <Badge variant="warning" className="gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Staff Desk
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Fulfill reserved holds, verify member identity, and perform walk-in checkouts.
          </p>
        </div>

        {/* Quick Staff Login if not logged in as staff */}
        {!isStaff && (
          <Link href="/login">
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
            >
              <LogIn className="w-3.5 h-3.5 mr-1 text-amber-600" />
              Sign in with a staff account
            </Button>
          </Link>
        )}
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-md">
        <button
          type="button"
          onClick={() => setDeskMode('pickup')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${deskMode === 'pickup'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <PackageCheck className="w-4 h-4" />
          Hold Pickup Queue
        </button>

        <button
          type="button"
          onClick={() => setDeskMode('checkout')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${deskMode === 'checkout'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          <QrCode className="w-4 h-4" />
          Walk-in Direct Checkout
        </button>
      </div>

      {/* MODE 1: Hold Pickup Desk */}
      {deskMode === 'pickup' && (
        <div className="space-y-6">
          {/* Search Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="relative">
                  <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchBarcode}
                    onChange={(e) => setSearchBarcode(e.target.value)}
                    placeholder="Filter by copy barcode..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="Filter by member email..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={loadPickupHolds}
                    isLoading={isLoadingHolds}
                    className="flex-1 text-xs"
                  >
                    <Search className="w-3.5 h-3.5 mr-1" />
                    Search Desk
                  </Button>
                  {(searchBarcode || searchEmail) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchBarcode('');
                        setSearchEmail('');
                      }}
                      className="text-xs"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Feedback */}
          {pickupError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{pickupError}</span>
            </div>
          )}

          {/* Holds Table / Cards */}
          {isLoadingHolds ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              Scanning ready holds...
            </div>
          ) : holds.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No pending hold pickups</h3>
              <p className="text-xs text-slate-500 mt-1">
                There are no reserved copies currently waiting on the shelf for collection.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Book Title</th>
                    <th className="px-4 py-3">Assigned Barcode</th>
                    <th className="px-4 py-3">Patron Name</th>
                    <th className="px-4 py-3">Pickup Deadline</th>
                    <th className="px-4 py-3 text-right">Desk Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holds.map((hold) => (
                    <tr key={hold.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{hold.bookTitle}</div>
                        <div className="text-[10px] text-slate-400">Book #{hold.bookId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-indigo-700 font-semibold">
                          {hold.copyBarcode}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{hold.memberName}</div>
                        <div className="text-[10px] text-slate-400">Patron #{hold.userId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-amber-700">
                          {formatDateTime(hold.pickupDeadline)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          isLoading={fulfillingHoldId === hold.id}
                          onClick={() => handleConfirmPickup(hold)}
                          className="text-xs gap-1.5"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Confirm & Hand Over
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODE 2: Walk-in Direct Checkout */}
      {deskMode === 'checkout' && (
        <div className="max-w-xl mx-auto space-y-6">
          <Card>
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-600" />
                Scan & Checkout Copy
              </CardTitle>
              <CardDescription>
                Immediately check out a physical copy off the shelf for a walk-in patron.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-0 space-y-5">
              {checkoutError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}

              <form onSubmit={handleWalkInCheckout} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Patron Member Email
                    </label>
                  </div>
                  <input
                    type="email"
                    required
                    value={checkoutEmail}
                    onChange={(e) => setCheckoutEmail(e.target.value)}
                    placeholder="patron@example.com"
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Physical Copy Barcode
                  </label>
                  <input
                    type="text"
                    required
                    value={checkoutBarcode}
                    onChange={(e) => setCheckoutBarcode(e.target.value)}
                    placeholder="e.g. BC-1001 or scan barcode"
                    className="w-full font-mono px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    The copy must currently have AVAILABLE status in inventory.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isCheckingOut}
                  className="w-full justify-center py-2.5 text-sm gap-2 mt-2"
                >
                  <PackageCheck className="w-4 h-4" />
                  Complete Walk-in Checkout
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

