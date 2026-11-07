'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Loan, ReturnCondition } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import { RETURN_LOAN_MUTATION } from '@/lib/graphql-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  RotateCcw,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  FileText,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';

export default function StaffReturnsPage() {
  const { isStaff, switchDemoUser } = useAuth();

  const [barcode, setBarcode] = useState('');
  const [condition, setCondition] = useState<ReturnCondition>('GOOD');
  const [damageFeeRs, setDamageFeeRs] = useState<string>('');
  const [conditionNote, setConditionNote] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnReceipt, setReturnReceipt] = useState<Loan | null>(null);

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) {
      setError('Please provide or scan a copy barcode.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setReturnReceipt(null);

      const parsedDamageFee =
        condition === 'DAMAGED' && damageFeeRs ? parseFloat(damageFeeRs) : undefined;

      const res = await fetchGraphQL<{ returnLoan: Loan }>(RETURN_LOAN_MUTATION, {
        copyBarcode: barcode.trim(),
        condition,
        conditionNote: conditionNote.trim() || undefined,
        damageFeeRs: parsedDamageFee,
      });

      setReturnReceipt(res.returnLoan);
      setBarcode('');
      setCondition('GOOD');
      setDamageFeeRs('');
      setConditionNote('');
    } catch (err: any) {
      setError(err.message || 'Failed to process return for this copy.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Returns & Inspection Desk
            </h1>
            <Badge variant="warning">Staff Returns</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Check in returned copies, inspect item condition, and evaluate overdue/damage fees.
          </p>
        </div>

        {!isStaff && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => switchDemoUser('LIBRARIAN')}
            className="text-xs text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
            Switch to Staff Persona
          </Button>
        )}
      </div>

      {/* Return Form */}
      <Card>
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-indigo-600" />
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Copy Barcode
              </label>
              <div className="relative">
                <QrCode className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="e.g. BC-1001 or scan"
                  className="w-full font-mono pl-10 pr-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Condition Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Physical Condition Inspection
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCondition('GOOD')}
                  className={`p-3 rounded-xl border text-left transition-all ${condition === 'GOOD'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Good Condition</span>
                    {condition === 'GOOD' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Normal wear and tear. Restores copy directly to available shelf.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCondition('DAMAGED')}
                  className={`p-3 rounded-xl border text-left transition-all ${condition === 'DAMAGED'
                      ? 'border-rose-500 bg-rose-50 text-rose-900 ring-2 ring-rose-500'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs">Damaged</span>
                    {condition === 'DAMAGED' && (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
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
      {returnReceipt && (
        <Card className="border-emerald-200 bg-emerald-50/50 shadow-md">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <CardTitle className="text-base text-emerald-900">
                Return Processed Successfully
              </CardTitle>
            </div>
            <CardDescription className="text-emerald-700">
              Circulation state machine updated in database transaction.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-5 pt-0 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-white rounded-xl border border-emerald-100">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Book Title
                </span>
                <span className="font-bold text-slate-800">{returnReceipt.bookTitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Copy Barcode
                </span>
                <span className="font-mono font-bold text-indigo-700">
                  {returnReceipt.copyBarcode}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Checked In At
                </span>
                <span className="text-slate-700 font-medium">
                  {formatDateTime(returnReceipt.returnedAt)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Inspected Condition
                </span>
                <Badge
                  variant={returnReceipt.returnCondition === 'GOOD' ? 'success' : 'danger'}
                >
                  {returnReceipt.returnCondition}
                </Badge>
              </div>
            </div>

            {/* Fees Breakdown */}
            <div className="p-3 bg-white rounded-xl border border-emerald-100 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Accrued Late Fee:</span>
                <span
                  className={`font-semibold ${returnReceipt.accruedLateFeeRs > 0 ? 'text-rose-600' : 'text-slate-800'
                    }`}
                >
                  {formatCurrency(returnReceipt.accruedLateFeeRs)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-bold">
                <span className="text-slate-800">Loan Status:</span>
                <Badge variant="secondary">{returnReceipt.status}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

