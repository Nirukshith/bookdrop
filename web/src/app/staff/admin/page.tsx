'use client';

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
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
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
  Sparkles,
  Shield,
} from 'lucide-react';

export default function StaffAdminPage() {
  const { user, isStaff, isAdmin, switchDemoUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'jobs' | 'fines' | 'notifications'>('jobs');

  // Job Statuses state
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [runningJobName, setRunningJobName] = useState<string | null>(null);
  const [jobRunResult, setJobRunResult] = useState<JobRunResult | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  // Fines desk state
  const [fineMemberEmail, setFineMemberEmail] = useState('patron@example.com');
  const [memberFinesList, setMemberFinesList] = useState<Fine[]>([]);
  const [isLoadingFines, setIsLoadingFines] = useState(false);
  const [finesError, setFinesError] = useState<string | null>(null);
  const [finesSuccess, setFinesSuccess] = useState<string | null>(null);

  // Payment Modal
  const [paymentFine, setPaymentFine] = useState<Fine | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentNote, setPaymentNote] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Waive Modal
  const [waiveFineItem, setWaiveFineItem] = useState<Fine | null>(null);
  const [waiveReason, setWaiveReason] = useState<string>('');
  const [isSubmittingWaive, setIsSubmittingWaive] = useState(false);

  // Notifications retry state
  const [retryId, setRetryId] = useState<string>('');
  const [isRetryingNotif, setIsRetryingNotif] = useState(false);
  const [retryResult, setRetryResult] = useState<Notification | null>(null);
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
    try {
      setRunningJobName(jobName);
      setJobError(null);
      setJobRunResult(null);

      const res = await fetchGraphQL<{ runJob: JobRunResult }>(RUN_JOB_MUTATION, {
        name: jobName,
      });

      setJobRunResult(res.runJob);
      loadJobs();
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
      setFinesSuccess(null);

      await fetchGraphQL(RECORD_FINE_PAYMENT_MUTATION, {
        fineId: paymentFine.id,
        amountRs: parseFloat(paymentAmount),
        note: paymentNote.trim() || undefined,
      });

      setFinesSuccess(`Payment of ₹${paymentAmount} recorded successfully!`);
      setPaymentFine(null);
      setPaymentAmount('');
      setPaymentNote('');
      loadMemberFines();
    } catch (err: any) {
      setFinesError(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleWaiveFine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waiveFineItem || !waiveReason.trim()) return;

    try {
      setIsSubmittingWaive(true);
      setFinesError(null);
      setFinesSuccess(null);

      await fetchGraphQL(WAIVE_FINE_MUTATION, {
        fineId: waiveFineItem.id,
        reason: waiveReason.trim(),
      });

      setFinesSuccess(`Fine #${waiveFineItem.id} waived successfully.`);
      setWaiveFineItem(null);
      setWaiveReason('');
      loadMemberFines();
    } catch (err: any) {
      setFinesError(err.message || 'Failed to waive fine');
    } finally {
      setIsSubmittingWaive(false);
    }
  };

  const handleRetryNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retryId.trim()) return;

    try {
      setIsRetryingNotif(true);
      setRetryError(null);
      setRetryResult(null);

      const res = await fetchGraphQL<{ retryNotification: Notification }>(
        RETRY_NOTIFICATION_MUTATION,
        { id: parseInt(retryId.trim(), 10) }
      );

      setRetryResult(res.retryNotification);
      setRetryId('');
    } catch (err: any) {
      setRetryError(err.message || 'Failed to retry notification delivery');
    } finally {
      setIsRetryingNotif(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Administration & System Health
            </h1>
            <Badge variant="danger" className="gap-1">
              <Shield className="w-3.5 h-3.5" />
              Admin
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Monitor distributed job leases, manually trigger background workers, process payments, and retry notifications.
          </p>
        </div>

        {!isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => switchDemoUser('ADMIN')}
            className="text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-rose-600" />
            Switch to Admin Persona
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'jobs'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <Cpu className="w-4 h-4" />
          Scheduled Job Leases ({jobs.length})
        </button>

        <button
          onClick={() => setActiveTab('fines')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'fines'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <DollarSign className="w-4 h-4" />
          Fines & Payment Desk
        </button>

        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'notifications'
              ? 'border-indigo-600 text-indigo-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
        >
          <Mail className="w-4 h-4" />
          Outbox & Retries
        </button>
      </div>

      {/* TAB 1: Background Jobs */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Distributed Job Leases</h2>
              <p className="text-xs text-slate-500">
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

          {jobRunResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Job &quot;{jobRunResult.jobName}&quot; Completed in {jobRunResult.durationMs}ms
              </div>
              <p className="text-emerald-700 font-mono text-[11px]">
                Stats: {jobRunResult.stats || 'Execution succeeded with zero errors.'}
              </p>
            </div>
          )}

          {jobError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{jobError}</span>
            </div>
          )}

          {isLoadingJobs ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              Inspecting job lease records...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => (
                <Card key={job.name} className="p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm font-mono">{job.name}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
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

                    <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs space-y-1 font-mono">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Last Finished:</span>
                        <span className="text-slate-700">{formatDateTime(job.lastFinishedAt)}</span>
                      </div>
                      {job.lastStats && (
                        <div className="text-[11px] text-slate-600 truncate pt-1">
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

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Rate-limited execution</span>
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={fineMemberEmail}
                    onChange={(e) => setFineMemberEmail(e.target.value)}
                    placeholder="Enter member email to inspect fines..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

          {finesSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{finesSuccess}</span>
            </div>
          )}

          {finesError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{finesError}</span>
            </div>
          )}

          {/* Fines Table */}
          {isLoadingFines ? (
            <div className="py-12 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
              Searching fines database...
            </div>
          ) : memberFinesList.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-700">No fines found</h3>
              <p className="text-xs text-slate-500 mt-1">
                This patron has no assessed circulation fines.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Fine ID / Reason</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Outstanding</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {memberFinesList.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">Fine #{f.id}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{f.reason}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">
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
                              onClick={() => setWaiveFineItem(f)}
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Receipt Note
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Cash / UPI / Desk transaction reference..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

          {/* Modal: Waive Fine */}
          {waiveFineItem && (
            <Modal
              isOpen={!!waiveFineItem}
              onClose={() => setWaiveFineItem(null)}
              title={`Waive Fine #${waiveFineItem.id}`}
              description="Waiving permanently forgives the balance and writes an audit log."
            >
              <form onSubmit={handleWaiveFine} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason for Waiver (Required)
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={waiveReason}
                    onChange={(e) => setWaiveReason(e.target.value)}
                    placeholder="e.g. Patron presented medical emergency certificate..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWaiveFineItem(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="danger" size="sm" isLoading={isSubmittingWaive}>
                    Confirm Permanent Waiver
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
                <RotateCw className="w-5 h-5 text-indigo-600" />
                Retry Failed Notification Delivery
              </CardTitle>
              <CardDescription>
                Manually re-enqueue an email notification that failed AWS SES delivery or reached retry limits.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-6 pt-0 space-y-5">
              {retryResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Notification #{retryResult.id} reset to PENDING with attemptCount 0. Delivery worker will reprocess it immediately.
                  </span>
                </div>
              )}

              {retryError && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{retryError}</span>
                </div>
              )}

              <form onSubmit={handleRetryNotification} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notification ID
                  </label>
                  <input
                    type="number"
                    required
                    value={retryId}
                    onChange={(e) => setRetryId(e.target.value)}
                    placeholder="e.g. 1024"
                    className="w-full font-mono px-3.5 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
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

