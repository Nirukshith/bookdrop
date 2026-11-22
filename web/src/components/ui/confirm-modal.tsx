'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { customSwal } from '@/lib/swal';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';

/*
 * The one confirmation dialog used across Bookdrop (holds, waitlists, logout,
 * membership review, desk/returns, fines, jobs...). Centered icon, title and
 * message, an optional "reason" picker with an "Other" free-text option, and
 * Cancel / Confirm pill buttons, in the portal's warm-paper look.
 *
 * Use it through the hook:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   const reason = await confirm({ title: 'Cancel hold?', tone: 'danger', ... });
 *   if (reason === null) return;      // user cancelled
 *   ...                                // reason is '' unless showReason was set
 *   return <>{confirmDialog}...</>;
 */

export type ConfirmTone = 'danger' | 'success' | 'warning' | 'info' | 'question';

export interface ConfirmReasonOption {
  value: string;
  label: string;
}

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  /** Override the tone's default icon. */
  icon?: LucideIcon;
  hideCancel?: boolean;
  /** Ask for a reason before confirming. Include { value: 'Other' } to allow free text. */
  showReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  reasons?: ConfirmReasonOption[];
}

const TONES: Record<
  ConfirmTone,
  { icon: LucideIcon; iconWrap: string; confirm: string; ring: string }
> = {
  danger: {
    icon: AlertTriangle,
    iconWrap: 'bg-rose-50 text-rose-600 border-rose-100',
    confirm: 'bg-rose-600 text-white hover:bg-rose-700',
    ring: 'focus-visible:ring-rose-600',
  },
  success: {
    icon: CheckCircle2,
    iconWrap: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    confirm: 'bg-emerald-600 text-white hover:bg-emerald-700',
    ring: 'focus-visible:ring-emerald-600',
  },
  warning: {
    icon: AlertOctagon,
    iconWrap: 'bg-amber-50 text-amber-600 border-amber-100',
    confirm: 'bg-black text-white hover:bg-black/85',
    ring: 'focus-visible:ring-black',
  },
  info: {
    icon: Info,
    iconWrap: 'bg-[#F4EFDF] text-black/70 border-black/[0.06]',
    confirm: 'bg-black text-white hover:bg-black/85',
    ring: 'focus-visible:ring-black',
  },
  question: {
    icon: HelpCircle,
    iconWrap: 'bg-brandYellow/40 text-black border-brandYellowWarm/40',
    confirm: 'bg-brandYellow text-black hover:bg-brandYellowWarm',
    ring: 'focus-visible:ring-black',
  },
};

const fieldCls =
  'w-full rounded-xl border border-black/[0.12] bg-white px-3.5 py-2.5 text-sm text-brandDark placeholder:text-black/35 transition-colors hover:border-black/25 focus:border-black focus:outline-none focus:ring-2 focus:ring-brandYellow';

export function ConfirmModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  tone = 'danger',
  icon,
  hideCancel = false,
  showReason = false,
  reasonLabel = 'Reason',
  reasonPlaceholder = 'Select a reason',
  reasons = [],
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');
  const focusRef = useRef<HTMLButtonElement>(null);
  const t = TONES[tone];
  const Icon = icon ?? t.icon;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setCustomReason('');
    setError('');
    // Safe default focus: Cancel for destructive actions, otherwise the confirm button.
    focusRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (showReason) {
      if (!reason) {
        setError('Please select a reason.');
        return;
      }
      if (reason === 'Other' && !customReason.trim()) {
        setError('Please describe the reason.');
        return;
      }
    }
    onConfirm(showReason ? (reason === 'Other' ? customReason.trim() : reason) : '');
  };

  const focusCancel = tone === 'danger' && !hideCancel;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-body text-brandDark">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={message ? 'confirm-modal-message' : undefined}
        className="relative flex w-full max-w-sm flex-col items-center rounded-[24px] border border-black/[0.08] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(17,17,17,0.45)]"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-black/40 transition-colors hover:bg-black/5 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div className={`mt-2 flex h-12 w-12 items-center justify-center rounded-full border ${t.iconWrap}`}>
          <Icon className="h-5 w-5" />
        </div>

        <h2 id="confirm-modal-title" className="mt-4 w-full px-2 text-center text-lg font-bold leading-snug tracking-tight">
          {title}
        </h2>
        {message && (
          <div id="confirm-modal-message" className="mt-2 w-full max-w-[320px] text-center text-sm leading-relaxed text-black/60">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 w-full space-y-4 text-left">
          {showReason && (
            <div>
              <label htmlFor="confirm-modal-reason" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">
                {reasonLabel} <span className="text-rose-600">*</span>
              </label>
              <select
                id="confirm-modal-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setError('');
                }}
                className={`${fieldCls} cursor-pointer`}
              >
                <option value="">{reasonPlaceholder}</option>
                {reasons.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showReason && reason === 'Other' && (
            <div>
              <label htmlFor="confirm-modal-custom" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">
                Describe the reason <span className="text-rose-600">*</span>
              </label>
              <input
                id="confirm-modal-custom"
                type="text"
                autoFocus
                maxLength={300}
                placeholder="Type the reason…"
                value={customReason}
                onChange={(e) => {
                  setCustomReason(e.target.value);
                  setError('');
                }}
                className={fieldCls}
              />
            </div>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className={`flex w-full gap-2 border-t border-black/[0.06] pt-4 ${hideCancel ? 'justify-center' : ''}`}>
            {!hideCancel && (
              <button
                ref={focusCancel ? focusRef : undefined}
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold transition-colors hover:border-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
              >
                {cancelText}
              </button>
            )}
            <button
              ref={focusCancel ? undefined : focusRef}
              type="submit"
              className={`${hideCancel ? 'min-w-[140px] px-6' : 'flex-1 px-4'} rounded-full py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${t.confirm} ${t.ring}`}
            >
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Promise-based confirmation. `confirm()` resolves with the chosen reason
 * ('' when no reason was asked for) or `null` if the user cancelled.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const settle = useCallback((value: string | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // A new request supersedes any dialog still open.
    resolverRef.current?.(null);
    setOptions(opts);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Resolve as cancelled if the component unmounts mid-question.
  useEffect(() => () => resolverRef.current?.(null), []);

  const onCancel = useCallback(() => settle(null), [settle]);
  const onConfirm = useCallback((reason: string) => settle(reason), [settle]);

  const confirmDialog = options ? (
    <ConfirmModal open {...options} onConfirm={onConfirm} onCancel={onCancel} />
  ) : null;

  /**
   * Result alert (success by default) shown with the animated SweetAlert2
   * `customSwal`: draw-in icon, auto-dismiss (paused on hover). Resolves when
   * it closes. Pass a longer `timer` for messages with details to read.
   */
  const notify = useCallback(
    async (opts: Pick<ConfirmOptions, 'title' | 'message'> & { tone?: ConfirmTone; timer?: number }) => {
      const tone = opts.tone ?? 'success';
      const show =
        tone === 'success' ? customSwal.success
          : tone === 'danger' ? customSwal.error
          : tone === 'warning' ? customSwal.warning
          : customSwal.info;
      await show(opts.title, opts.message ?? '', opts.timer);
    },
    [],
  );

  return { confirm, notify, confirmDialog };
}


/** Label/value rows for result dialogs (receipts, job stats...). */
export function ModalDetails({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="mt-3 w-full divide-y divide-black/[0.06] rounded-xl border border-black/[0.08] bg-[#FBF8EF] px-3 text-left text-sm">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-black/50">{label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-black/85">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
