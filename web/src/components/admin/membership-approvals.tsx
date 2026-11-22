'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  APPROVE_MEMBERSHIP_MUTATION,
  MEMBERSHIP_APPLICATIONS_QUERY,
  REJECT_MEMBERSHIP_MUTATION,
} from '@/lib/graphql-queries';
import { MembershipStatus, User } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { useConfirm } from '@/components/ui/confirm-modal';
import { AlertCircle, CheckCircle2, RefreshCw, UserCheck, UserX } from 'lucide-react';

const FILTERS: { status: MembershipStatus; label: string }[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'APPROVED', label: 'Approved' },
];

const STATUS_BADGE: Record<MembershipStatus, 'warning' | 'danger' | 'success'> = {
  PENDING: 'warning',
  REJECTED: 'danger',
  APPROVED: 'success',
};

/**
 * Admin-only review queue for self-registered members. A member must be
 * APPROVED before they can place holds, join waitlists or borrow.
 */
export function MembershipApprovals({
  onPendingCountChange,
}: {
  onPendingCountChange?: (count: number) => void;
}) {
  const [status, setStatus] = useState<MembershipStatus>('PENDING');
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, notify, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchGraphQL<{ membershipApplications: User[] }>(
        MEMBERSHIP_APPLICATIONS_QUERY,
        { status }
      );
      const list = data.membershipApplications || [];
      setMembers(list);
      if (status === 'PENDING') onPendingCountChange?.(list.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load membership applications');
    } finally {
      setIsLoading(false);
    }
  }, [status, onPendingCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (member: User, decision: 'approve' | 'reject') => {
    const who = (
      <>
        <span className="font-semibold text-black/80">{member.name}</span>
        {member.membershipNumber ? (
          <>
            {' '}(<span className="font-mono">{member.membershipNumber}</span>)
          </>
        ) : null}
      </>
    );
    const reason = await confirm(
      decision === 'approve'
        ? {
            title: 'Approve this membership?',
            message: (
              <>
                {who} will be able to place holds, join waitlists and borrow books, and will get an approval
                email. Only approve once you&apos;ve checked the number against library records.
              </>
            ),
            tone: 'success',
            icon: UserCheck,
            confirmText: 'Approve',
          }
        : {
            title: 'Reject this application?',
            message: <>{who} won&apos;t be able to borrow. We&apos;ll email them the reason you choose.</>,
            tone: 'danger',
            icon: UserX,
            confirmText: 'Reject',
            showReason: true,
            reasonLabel: 'Reason (shared with the member)',
            reasons: [
              { value: 'We could not find this membership number in our records.', label: 'Number not found in records' },
              { value: 'This membership number belongs to a different member.', label: 'Number belongs to someone else' },
              { value: 'This library card has expired. Please renew it at the desk.', label: 'Library card expired' },
              { value: 'The details provided do not match our records.', label: 'Details don’t match records' },
              { value: 'This looks like a duplicate of an existing account.', label: 'Duplicate account' },
              { value: 'Other', label: 'Other' },
            ],
          }
    );
    if (reason === null) return;
    try {
      setBusyId(member.id);
      setError(null);
      await fetchGraphQL(
        decision === 'approve' ? APPROVE_MEMBERSHIP_MUTATION : REJECT_MEMBERSHIP_MUTATION,
        decision === 'approve'
          ? { userId: parseInt(member.id, 10) }
          : { userId: parseInt(member.id, 10), reason }
      );
      await load();
      await notify(
        decision === 'approve'
          ? {
              title: 'Membership approved',
              message: <><span className="font-semibold text-black/80">{member.name}</span> can now place holds and borrow books. We&apos;ve emailed them the good news.</>,
            }
          : {
              title: 'Application rejected',
              message: (
                <>
                  We&apos;ve emailed <span className="font-semibold text-black/80">{member.name}</span> with the reason: {reason}
                </>
              ),
            }
      );
    } catch (err: any) {
      setError(err.message || `Could not ${decision} this membership`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Membership Approvals</h2>
          <p className="text-xs text-slate-500">
            Verify each membership number against library records before approving. Only approved
            members can place holds, join waitlists or borrow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-medium" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.status}
                role="tab"
                aria-selected={status === f.status}
                onClick={() => setStatus(f.status)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  status === f.status
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} isLoading={isLoading} className="text-xs gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide text-[10px]">
            <tr>
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Membership No.</th>
              <th className="px-4 py-3 font-semibold">Registered</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoading && members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {status === 'PENDING'
                    ? 'No applications waiting for review.'
                    : `No ${status.toLowerCase()} members.`}
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-semibold text-slate-800">{m.name}</div>
                  <div className="text-slate-500">{m.email}</div>
                </td>
                <td className="px-4 py-3 font-mono font-semibold tracking-wide text-slate-800">
                  {m.membershipNumber || '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(m.createdAt)}</td>
                <td className="px-4 py-3">
                  {m.membershipStatus && (
                    <Badge variant={STATUS_BADGE[m.membershipStatus]}>{m.membershipStatus}</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {m.membershipStatus !== 'APPROVED' && (
                      <Button
                        variant="success"
                        size="sm"
                        className="text-xs gap-1"
                        disabled={busyId !== null}
                        isLoading={busyId === m.id}
                        onClick={() => review(m, 'approve')}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                    )}
                    {m.membershipStatus === 'PENDING' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 text-rose-700 border-rose-200 hover:bg-rose-50"
                        disabled={busyId !== null}
                        onClick={() => review(m, 'reject')}
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
