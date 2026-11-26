'use client';

import Link from 'next/link';
import React, { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useConfirm, ModalDetails } from '@/components/ui/confirm-modal';
import { DevReturnLookup } from '@/components/staff/dev-return-lookup';
import { Loan, ReturnCondition } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import { RETURN_LOAN_MUTATION } from '@/lib/graphql-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PortalHero } from '@/components/portal/portal-ui';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  RotateCcw,
  QrCode,
  CheckCircle2,
  AlertCircle,
  LogIn,
  ShieldAlert,
  FileText,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

export default function StaffReturnsPage() {
  const { isStaff } = useAuth();
  const { confirm, notify, confirmDialog } = useConfirm();

  const [barcode, setBarcode] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  /** Dev lookup picked a loan: fill its barcode and bring the form into view. */
  const fillFromDevLookup = (value: string) => {
    setBarcode(value);
    setError(null);
    barcodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    barcodeRef.current?.focus();
  };
  const [condition, setCondition] = useState<ReturnCondition>('GOOD');
  const [damageFeeRs, setDamageFeeRs] = useState<string>('');
  const [conditionNote, setConditionNote] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) {
      setError('Please provide or scan a copy barcode.');
      return;
    }

    const damaged = condition === 'DAMAGED';
    const fee = damaged && damageFeeRs ? parseFloat(damageFeeRs) : 0;
    const ok = await confirm({
      title: damaged ? 'Return as damaged?' : 'Process this return?',
      message: (
        <>
          Check in copy <span className="font-mono font-semibold text-black/80">{barcode.trim()}</span>
          {damaged ? (
            <>
              {' '}as <span className="font-semibold text-black/80">damaged</span>
              {fee > 0 ? <>. A damage fee of <span className="font-semibold text-black/80">₹{fee.toFixed(2)}</span> will be charged to the member.</> : '.'}
            </>
          ) : (
            <> in good condition. Any late fees are calculated automatically.</>
          )}
        </>
      ),
      tone: damaged ? 'warning' : 'success',
      confirmText: damaged ? 'Return as damaged' : 'Process return',
    });
    if (ok === null) return;

    try {
      setIsLoading(true);
      setError(null);

      const parsedDamageFee =
        condition === 'DAMAGED' && damageFeeRs ? parseFloat(damageFeeRs) : undefined;

      const res = await fetchGraphQL<{ returnLoan: Loan }>(RETURN_LOAN_MUTATION, {
        copyBarcode: barcode.trim(),
        condition,
        conditionNote: conditionNote.trim() || undefined,
        damageFeeRs: parsedDamageFee,
      });

      setBarcode('');
      setCondition('GOOD');
      setDamageFeeRs('');
      setConditionNote('');
      const r = res.returnLoan;
      await notify({
        title: 'Return processed',
        timer: 4500,
        message: (
          <>
            {r.accruedLateFeeRs > 0
              ? 'The copy is checked in. A late fee was added to the member’s account.'
              : 'The copy is checked in and back in circulation.'}
            <ModalDetails
              rows={[
                { label: 'Book', value: r.bookTitle },
                { label: 'Copy', value: <span className="font-mono">{r.copyBarcode}</span> },
                { label: 'Checked in', value: formatDateTime(r.returnedAt) },
                { label: 'Condition', value: r.returnCondition === 'DAMAGED' ? 'Damaged' : 'Good' },
                {
                  label: 'Late fee',
                  value: (
                    <span className={r.accruedLateFeeRs > 0 ? 'text-rose-600' : undefined}>
                      {formatCurrency(r.accruedLateFeeRs)}
                    </span>
                  ),
                },
              ]}
            />
          </>
        ),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to process return for this copy.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="font-body text-brandDark space-y-8 pb-8 max-w-3xl mx-auto">
      {confirmDialog}
      {/* Page header */}
      <PortalHero
        eyebrow="Staff Returns"
        title="Returns & Inspection Desk"
        description="Check in returned copies, inspect item condition, and evaluate overdue/damage fees."
        actions={
          <>
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
          </>
        }
      />

      {/* Dev only: look up the loan by member ID + book ID */}
      <DevReturnLookup onUseBarcode={fillFromDevLookup} />

      {/* Return Form */}
      <Card>
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-brandForest" />
            Process Item Check-in
          </CardTitle>
          <CardDescription>
            Scan or enter the barcode located on the inside cover of the returned book.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 pt-0 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleReturnSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-black/75 mb-1">
                Copy Barcode
              </label>
              <div className="relative">
                <QrCode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  ref={barcodeRef}
                  type="text"
                  required
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g. BC-1001 or scan"
                  className="w-full font-mono pl-10 pr-3.5 py-2 text-sm rounded-lg border border-black/15 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            {/* Condition Selection */}
            <div>
              <label className="block text-xs font-semibold text-black/75 mb-2">
                Physical Condition Inspection
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCondition('GOOD')}
                  className={`p-3 rounded-xl border text-left transition-all ${condition === 'GOOD'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500'
                      : 'border-black/[0.08] bg-white text-black/75 hover:bg-black/[0.03]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Good Condition</span>
                    {condition === 'GOOD' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-black/55">
                    Normal wear and tear. Restores copy directly to available shelf.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCondition('DAMAGED')}
                  className={`p-3 rounded-xl border text-left transition-all ${condition === 'DAMAGED'
                      ? 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-500'
                      : 'border-black/[0.08] bg-white text-black/75 hover:bg-black/[0.03]'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Damaged</span>
                    {condition === 'DAMAGED' && (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-black/55">
                    Water damage, missing pages, or broken binding. Assess fine.
                  </p>
                </button>
              </div>
            </div>

            {/* Damaged Options */}
            {condition === 'DAMAGED' && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3 animate-in fade-in duration-150">
                <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Damage Assessment Details
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                    Assessed Damage Fee (Rupees)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-black/40">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={damageFeeRs}
                      onChange={(e) => setDamageFeeRs(e.target.value)}
                      placeholder="e.g. 150.00"
                      className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-rose-900 mb-1">
                    Inspection Note / Damage Description
                  </label>
                  <textarea
                    rows={2}
                    value={conditionNote}
                    onChange={(e) => setConditionNote(e.target.value)}
                    placeholder="Describe specific damage (e.g. soaked cover, pages 40-50 ripped)..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full justify-center py-2.5 text-sm gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Complete Check-In & Update Inventory
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Return Receipt Card */}
    </div>
  );
}

