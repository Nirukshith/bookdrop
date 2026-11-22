'use client';

import React, { useState } from 'react';
import { fetchGraphQL } from '@/lib/graphql-client';
import { formatDate } from '@/lib/utils';
import { Search, Wrench, ArrowDownToLine } from 'lucide-react';

/**
 * DEVELOPMENT ONLY: find a member's active loan by member ID + book ID and
 * fill its copy barcode into the normal return form, so the real check-in
 * flow can be tested without a physical barcode. NODE_ENV is inlined at build
 * time, so production bundles render nothing here.
 */
export const DEV_RETURN_LOOKUP_ENABLED = process.env.NODE_ENV === 'development';

const ACTIVE_LOANS_QUERY = `
  query DevActiveLoans($filter: LoanFilterInput) {
    loans(filter: $filter) {
      id
      userId
      bookId
      bookTitle
      copyBarcode
      dueAt
      isOverdue
      daysLate
    }
  }
`;

interface DevLoan {
  id: string;
  userId: number;
  bookId: number;
  bookTitle: string;
  copyBarcode?: string | null;
  dueAt: string;
  isOverdue: boolean;
  daysLate: number;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400';

export function DevReturnLookup({ onUseBarcode }: { onUseBarcode: (barcode: string) => void }) {
  const [memberId, setMemberId] = useState('');
  const [bookId, setBookId] = useState('');
  const [loans, setLoans] = useState<DevLoan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!DEV_RETURN_LOOKUP_ENABLED) return null;

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = parseInt(memberId, 10);
    const book = parseInt(bookId, 10);
    if (!userId || !book) {
      setError('Enter a numeric member ID and book ID.');
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchGraphQL<{ loans: DevLoan[] }>(ACTIVE_LOANS_QUERY, {
        filter: { userId, bookId: book, status: 'ACTIVE' },
      });
      setLoans(data.loans);
      // Exactly one match: fill the form straight away.
      if (data.loans.length === 1 && data.loans[0].copyBarcode) onUseBarcode(data.loans[0].copyBarcode);
    } catch (err: any) {
      setError(err.message || 'Lookup failed');
      setLoans(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5 space-y-4">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-800">
          <Wrench className="h-3.5 w-3.5" />
          Dev only · find loan by member ID + book ID
        </p>
        <p className="mt-1 text-xs text-amber-900/70">
          IDs are shown on the Checkout Desk (&ldquo;Patron #…&rdquo;, &ldquo;Book #…&rdquo;). The match fills the barcode below; then
          choose the condition and process the return as normal.
        </p>
      </div>

      <form onSubmit={find} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-slate-700">
          Member ID
          <input value={memberId} onChange={(e) => setMemberId(e.target.value)} inputMode="numeric" placeholder="e.g. 10200" className={`${inputCls} mt-1`} />
        </label>
        <label className="flex-1 text-xs font-semibold text-slate-700">
          Book ID
          <input value={bookId} onChange={(e) => setBookId(e.target.value)} inputMode="numeric" placeholder="e.g. 8486" className={`${inputCls} mt-1`} />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50"
        >
          <Search className="h-4 w-4" />
          {isLoading ? 'Finding…' : 'Find loan'}
        </button>
      </form>

      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}

      {loans && loans.length === 0 && (
        <p className="text-xs font-semibold text-slate-700">
          No active loan for member #{memberId} and book #{bookId}.
        </p>
      )}

      {loans && loans.length > 0 && (
        <ul className="space-y-2">
          {loans.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 text-xs">
              <div>
                <p className="font-semibold text-slate-900">{l.bookTitle}</p>
                <p className="text-slate-500">
                  Loan #{l.id} · copy <span className="font-mono">{l.copyBarcode ?? '—'}</span> · due {formatDate(l.dueAt)}
                  {l.isOverdue && <span className="font-semibold text-rose-600"> · {l.daysLate}d overdue</span>}
                </p>
              </div>
              {l.copyBarcode && (
                <button
                  type="button"
                  onClick={() => onUseBarcode(l.copyBarcode!)}
                  className="inline-flex items-center gap-1 rounded-full border border-black/15 bg-white px-3 py-1.5 font-semibold hover:border-black/40"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Use this copy
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
