'use client';

import Link from 'next/link';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { JobStatus, JobRunResult, Fine, Notification } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  JOB_STATUSES_QUERY,
  RUN_JOB_MUTATION,
  MEMBER_FINES_QUERY,
  RECORD_FINE_PAYMENT_MUTATION,
  WAIVE_FINE_MUTATION,
  RETRY_NOTIFICATION_MUTATION,
} from '@/lib/graphql-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PortalHero } from '@/components/portal/portal-ui';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { MembershipApprovals } from '@/components/admin/membership-approvals';
import { useConfirm, ModalDetails } from '@/components/ui/confirm-modal';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import {
  Cpu,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  DollarSign,
  Mail,
  RotateCw,
  Search,
  LogIn,
  Shield,
  UserCheck,
} from 'lucide-react';

export default function StaffAdminPage() {
  const { user, isStaff, isAdmin } = useAuth();
  const { confirm, notify, confirmDialog } = useConfirm();

  const [activeTab, setActiveTab] = useState<'members' | 'jobs' | 'fines' | 'notifications'>('members');
  const [pendingMembers, setPendingMembers] = useState<number | null>(null);

  // Job Statuses state
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [runningJobName, setRunningJobName] = useState<string | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  // Fines desk state
  const [fineMemberEmail, setFineMemberEmail] = useState('');
  const [memberFinesList, setMemberFinesList] = useState<Fine[]>([]);
  const [isLoadingFines, setIsLoadingFines] = useState(false);
  const [finesError, setFinesError] = useState<string | null>(null);

  // Payment Modal
  const [paymentFine, setPaymentFine] = useState<Fine | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Waive Modal

  // Notifications retry state
  const [retryId, setRetryId] = useState<string>('');
  const [isRetryingNotif, setIsRetryingNotif] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setIsLoadingJobs(true);
      setJobError(null);
      const data = await fetchGraphQL<{ jobStatuses: JobStatus[] }>(JOB_STATUSES_QUERY);
      setJobs(data.jobStatuses || []);
    } catch (err: any) {
      setJobError(err.message || 'Failed to load background job statuses');
    } finally {
      setIsLoadingJobs(false);
    }
  }, []);

  const loadMemberFines = useCallback(async () => {
    if (!fineMemberEmail.trim()) return;
    try {
      setIsLoadingFines(true);
      setFinesError(null);
      const data = await fetchGraphQL<{ memberFines: Fine[] }>(MEMBER_FINES_QUERY, {
        memberEmail: fineMemberEmail.trim(),
      });
      setMemberFinesList(data.memberFines || []);
    } catch (err: any) {
      setFinesError(err.message || 'Failed to load fines for this member');
    } finally {
      setIsLoadingFines(false);
    }
  }, [fineMemberEmail]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const handleRunJob = async (jobName: string) => {
    const ok = await confirm({
      title: 'Run this job now?',
      message: (
        <>
          <span className="font-mono font-semibold text-black/80">{jobName}</span> will run immediately, outside its
          schedule. It may send emails or change holds and fines.
        </>
      ),
      tone: 'warning',
      confirmText: 'Run job',
    });
    if (ok === null) return;
    try {
      setRunningJobName(jobName);
      setJobError(null);

      const res = await fetchGraphQL<{ runJob: JobRunResult }>(RUN_JOB_MUTATION, {
        name: jobName,
      });

      loadJobs();
      const r = res.runJob;
      const failed = !!r.error || r.status === 'FAILED';
      await notify({
        title: r.skipped ? 'Job skipped' : failed ? 'Job failed' : 'Job completed',
        tone: r.skipped ? 'warning' : failed ? 'danger' : 'success',
        timer: 4500,
        message: (
          <>
            {r.skipped
              ? 'Another runner is already processing this job, so this run did nothing.'
              : failed
                ? 'The job ran but reported an error.'
                : 'The job ran successfully.'}
            <ModalDetails
              rows={[
                { label: 'Job', value: <span className="font-mono">{r.jobName}</span> },
                { label: 'Status', value: r.status },
                { label: 'Duration', value: `${r.durationMs} ms` },
                ...(r.stats ? [{ label: 'Stats', value: <span className="font-mono text-xs">{r.stats}</span> }] : []),
                ...(r.error ? [{ label: 'Error', value: <span className="text-rose-600">{r.error}</span> }] : []),
              ]}
            />
          </>
        ),
      });
    } catch (err: any) {
      setJobError(err.message || `Failed to trigger job ${jobName}`);
    } finally {
      setRunningJobName(null);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentFine || !paymentAmount) return;

    try {
      setIsSubmittingPayment(true);
      setFinesError(null);

      await fetchGraphQL(RECORD_FINE_PAYMENT_MUTATION, {
        fineId: paymentFine.id,
        amountRs: parseFloat(paymentAmount),
        note: paymentNote.trim() || undefined,
      });

      const paidFine = paymentFine;
      const paid = paymentAmount;
      setPaymentFine(null);
      setPaymentAmount('');
      setPaymentNote('');
      loadMemberFines();
      void notify({
        title: 'Payment recorded',
        message: (
          <>
            <span className="font-semibold text-black/80">{formatCurrency(parseFloat(paid))}</span> was recorded against fine #
            {paidFine.id}.
          </>
        ),
      });
    } catch (err: any) {
      setFinesError(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleWaiveFine = async (fine: Fine) => {
    const reason = await confirm({
      title: `Waive fine #${fine.id}?`,
      message: (
        <>
          This permanently forgives the outstanding{' '}
          <span className="font-semibold text-black/80">{formatCurrency(fine.outstandingRs)}</span> and is recorded
          in the audit log.
        </>
      ),
      tone: 'danger',
      confirmText: 'Waive fine',
      showReason: true,
      reasonLabel: 'Reason for waiver',
      reasons: [
        { value: 'Medical or family emergency', label: 'Medical or family emergency' },
        { value: 'Library error (incorrect fine)', label: 'Library error (incorrect fine)' },
        { value: 'Item returned in good faith via book drop', label: 'Returned via book drop' },
        { value: 'Hardship', label: 'Financial hardship' },
        { value: 'Goodwill gesture', label: 'Goodwill gesture' },
        { value: 'Other', label: 'Other' },
      ],
    });
    if (reason === null) return;

    try {
      setFinesError(null);
      await fetchGraphQL(WAIVE_FINE_MUTATION, { fineId: fine.id, reason });
      loadMemberFines();
      await notify({
        title: 'Fine waived',
        message: (
          <>
            Fine #{fine.id} (<span className="font-semibold text-black/80">{formatCurrency(fine.outstandingRs)}</span>) has been waived.
            Reason: {reason}
          </>
        ),
      });
    } catch (err: any) {
      setFinesError(err.message || 'Failed to waive fine');
    }
  };

  const handleRetryNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryId.trim()) return;
    const ok = await confirm({
      title: 'Retry this notification?',
      message: (
        <>
          Notification <span className="font-mono font-semibold text-black/80">#{retryId.trim()}</span> will be
          queued for delivery again, so the member may receive the email.
        </>
      ),
      tone: 'info',
      confirmText: 'Retry delivery',
    });
    if (ok === null) return;

    try {
      setIsRetryingNotif(true);
      setRetryError(null);

      const res = await fetchGraphQL<{ retryNotification: Notification }>(
        RETRY_NOTIFICATION_MUTATION,
        { id: parseInt(retryId.trim(), 10) }
      );

      setRetryId('');
      await notify({
        title: 'Notification re-queued',
        message: (
          <>
            Notification <span className="font-mono font-semibold text-black/80">#{res.retryNotification.id}</span> is back in the
            queue and will be delivered on the next send run.
          </>
        ),
      });
    } catch (err: any) {
      setRetryError(err.message || 'Failed to retry notification delivery');
    } finally {
      setIsRetryingNotif(false);
    }
  };

  return (
    <div className="font-body text-brandDark space-y-8 pb-8">
      {confirmDialog}
      {/* Page header */}
      <PortalHero
        eyebrow="Admin"
        title="Administration & System Health"
        description="Approve new memberships, monitor distributed job leases, trigger background workers, process payments, and retry notifications."
        actions={
          <>
          {!isAdmin && (
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200"
              >
                <LogIn className="w-3.5 h-3.5 mr-1 text-rose-600" />
                Sign in with an admin account
              </Button>
            </Link>
          )}
          </>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-black/[0.08] space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('members')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'members'
              ? 'border-brandForest text-brandForest font-semibold'
              : 'border-transparent text-black/55 hover:text-black/85'
            }`}
        >
          <UserCheck className="w-4 h-4" />
          Membership Approvals
          {!!pendingMembers && (
            <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {pendingMembers}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('jobs')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'jobs'
              ? 'border-brandForest text-brandForest font-semibold'
              : 'border-transparent text-black/55 hover:text-black/85'
            }`}
        >
          <Cpu className="w-4 h-4" />
          Scheduled Job Leases ({jobs.length})
        </button>

        <button
          onClick={() => setActiveTab('fines')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'fines'
              ? 'border-brandForest text-brandForest font-semibold'
              : 'border-transparent text-black/55 hover:text-black/85'
            }`}
        >
          <DollarSign className="w-4 h-4" />
          Fines & Payment Desk
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notifications'
              ? 'border-brandForest text-brandForest font-semibold'
              : 'border-transparent text-black/55 hover:text-black/85'
            }`}
        >
          <Mail className="w-4 h-4" />
          Outbox & Retries
        </button>
      </div>

      {/* TAB 0: Membership approvals (admin only; the API enforces this too) */}
      {activeTab === 'members' && isAdmin && (
        <MembershipApprovals onPendingCountChange={setPendingMembers} />
      )}

      {/* TAB 1: Background Jobs */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-black/85">Distributed Job Leases</h2>
              <p className="text-xs text-black/55">
                Jobs acquire pessimistic database leases to ensure single-worker execution across instances.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadJobs}
              isLoading={isLoadingJobs}
              className="text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh Leases
            </Button>
          </div>

          {jobError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{jobError}</span>
            </div>
          )}

          {isLoadingJobs ? (
            <div className="py-12 text-center text-xs text-black/55">
              <RefreshCw className="w-6 h-6 animate-spin text-brandForest mx-auto mb-2" />
              Inspecting job lease records...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => (
                <Card key={job.name} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-brandDark text-sm font-mono">{job.name}</h3>
                        <p className="text-xs text-black/40 mt-0.5">
                          {job.isLeased ? (
                            <span className="text-amber-600 font-medium flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Leased by {job.lockedBy || 'worker'}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              Available for acquisition
                            </span>
                          )}
                        </p>
                      </div>

                      <Badge variant={job.lastStatus === 'FAILED' ? 'danger' : 'success'}>
                        {job.lastStatus || 'IDLE'}
                      </Badge>
                    </div>

                    <div className="mt-4 p-3 bg-black/[0.03] rounded-lg text-xs space-y-1 font-mono">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-black/40">Last Finished:</span>
                        <span className="text-black/75">{formatDateTime(job.lastFinishedAt)}</span>
                      </div>
                      {job.lastStats && (
                        <div className="text-[11px] text-black/65 truncate pt-1">
                          Stats: {job.lastStats}
                        </div>
                      )}
                      {job.lastError && (
                        <div className="text-[11px] text-rose-600 pt-1">
                          Error: {job.lastError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-black/[0.06] flex items-center justify-between">
                    <span className="text-[11px] text-black/40">Rate-limited execution</span>
                    <Button
                      variant="primary"
                      size="sm"
                      isLoading={runningJobName === job.name}
                      onClick={() => handleRunJob(job.name)}
                      className="text-xs gap-1.5"
                    >
                      <Play className="w-3 h-3" />
                      Run Job Now
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Fines Desk */}
      {activeTab === 'fines' && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                  <input
                    type="email"
                    value={fineMemberEmail}
                    onChange={(e) => setFineMemberEmail(e.target.value)}
                    placeholder="Enter member email to inspect fines..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-black/15 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={loadMemberFines}
                  isLoading={isLoadingFines}
                  className="w-full sm:w-auto text-xs gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search Member Fines
                </Button>
              </div>
            </CardContent>
          </Card>

          {finesError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{finesError}</span>
            </div>
          )}

          {/* Fines Table */}
          {isLoadingFines ? (
            <div className="py-12 text-center text-xs text-black/55">
              <RefreshCw className="w-6 h-6 animate-spin text-brandForest mx-auto mb-2" />
              Searching fines database...
            </div>
          ) : memberFinesList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-black/[0.08] p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-black/75">No fines found</h3>
              <p className="text-xs text-black/55 mt-1">
                This patron has no assessed circulation fines.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/[0.08] bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-black/[0.03] text-black/55 uppercase font-semibold border-b border-black/[0.08]">
                  <tr>
                    <th className="px-4 py-3">Fine ID / Reason</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.06]">
                  {memberFinesList.map((f) => (
                    <tr key={f.id} className="hover:bg-black/[0.03]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-brandDark">Fine #{f.id}</div>
                        <div className="text-[10px] text-black/40 font-semibold">{f.reason}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-black/75">
                        {formatCurrency(f.amountRs)}
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600">
                        {formatCurrency(f.paidRs)}
                      </td>
                      <td className="px-4 py-3 font-bold text-rose-600">
                        {formatCurrency(f.outstandingRs)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            f.status === 'PAID'
                              ? 'success'
                              : f.status === 'WAIVED'
                                ? 'secondary'
                                : 'danger'
                          }
                        >
                          {f.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.outstandingRs > 0 && f.status !== 'WAIVED' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setPaymentFine(f);
                                setPaymentAmount(f.outstandingRs.toString());
                              }}
                              className="text-xs py-1 px-2.5 h-auto"
                            >
                              Collect Pay
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleWaiveFine(f)}
                              className="text-xs py-1 px-2.5 h-auto text-amber-700 hover:bg-amber-50"
                            >
                              Waive
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal: Collect Payment */}
          {paymentFine && (
            <Modal
              isOpen={!!paymentFine}
              onClose={() => setPaymentFine(null)}
              title={`Collect Payment - Fine #${paymentFine.id}`}
              description={`Outstanding balance: ${formatCurrency(paymentFine.outstandingRs)}`}
            >
              <form onSubmit={handleRecordPayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black/75 mb-1">
                    Amount Received (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={paymentFine.outstandingRs}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-black/15 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black/75 mb-1">
                    Receipt Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Cash / UPI / Desk transaction reference..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-black/15 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaymentFine(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingPayment}>
                    Record Cash/UPI Payment
                  </Button>
                </div>
              </form>
            </Modal>
          )}

        </div>
      )}

      {/* TAB 3: Notifications Outbox & Retry */}
      {activeTab === 'notifications' && (
        <div className="max-w-xl mx-auto space-y-6">
          <Card>
            <CardHeader className="p-6 pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCw className="w-5 h-5 text-brandForest" />
                Retry Failed Notification Delivery
              </CardTitle>
              <CardDescription>
                Manually re-enqueue an email notification that failed AWS SES delivery or reached retry limits.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-0 space-y-5">
              {retryError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{retryError}</span>
                </div>
              )}

              <form onSubmit={handleRetryNotification} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black/75 mb-1">
                    Notification ID
                  </label>
                  <input
                    type="number"
                    required
                    value={retryId}
                    onChange={(e) => setRetryId(e.target.value)}
                    placeholder="e.g. 1024"
                    className="w-full font-mono px-3.5 py-2 text-sm rounded-lg border border-black/15 focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <p className="text-[11px] text-black/40 mt-1">
                    Enter the integer ID of the failed outbox notification record.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isRetryingNotif}
                  className="w-full justify-center py-2.5 text-sm gap-2"
                >
                  <RotateCw className="w-4 h-4" />
                  Reset & Retry Outbox Delivery
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

