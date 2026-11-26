'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { FlatBookCover } from '@/components/landing/book-3d';

/*
 * Shared building blocks for the member portal (catalog, dashboard, settings),
 * in the landing page's look: warm paper, cream/yellow panels, Integral CF headings,
 * Futura body text and pill buttons.
 */

/* ── Buttons (class strings so they work on <button> and <Link>) ─────── */
const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
/** Dark green: the main action. */
export const btnPrimary = `${btnBase} bg-brandForest text-white hover:bg-brandForestDark`;
/** Black: the main action on a yellow surface, or the final step in a dialog. */
export const btnDark = `${btnBase} bg-black text-white hover:bg-black/85`;
/** Outlined: secondary actions. */
export const btnOutline = `${btnBase} border border-black/15 bg-white text-black hover:border-black/40`;
/** Outlined red: cancel / leave / sign out. */
export const btnDanger = `${btnBase} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:border-rose-300`;

/* ── Page ──────────────────────────────────────────────────────────────── */
export function PortalPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-body text-brandDark space-y-8 pb-8 ${className}`}>{children}</div>;
}

export function Eyebrow({ children, dot = true }: { children: React.ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/70 border border-black/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/70">
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
      {children}
    </span>
  );
}

/** Cream/yellow header panel with an Integral CF title. */
export function PortalHero({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="catalog-hero relative overflow-hidden rounded-[28px] border border-black/[0.06] px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div className="max-w-2xl min-w-0">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1 className="font-heading text-[clamp(2.2rem,5.5vw,3.75rem)] leading-[0.95] tracking-[-0.01em] mt-4 break-words">
            {title}
          </h1>
          {description && <div className="mt-3 text-[15px] sm:text-base text-black/70 leading-relaxed">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children && <div className="mt-8">{children}</div>}
    </section>
  );
}

/** White card used for content sections. */
export function Panel({
  title,
  description,
  icon: Icon,
  children,
  className = '',
  bodyClassName = 'p-6',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-2xl border border-black/[0.08] bg-white ${className}`}>
      {title && (
        <header className="px-6 pt-6">
          <h2 className="flex items-center gap-2 text-base font-bold">
            {Icon && <Icon className="w-4 h-4 text-black/50" />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-black/55">{description}</p>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ── Feedback ──────────────────────────────────────────────────────────── */
const NOTICE_TONES = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2, iconCls: 'text-emerald-600' },
  error: { box: 'border-rose-200 bg-rose-50 text-rose-900', icon: AlertTriangle, iconCls: 'text-rose-600' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle, iconCls: 'text-amber-600' },
  info: { box: 'border-black/10 bg-white text-black/80', icon: Info, iconCls: 'text-black/50' },
} as const;

export function Notice({
  tone,
  title,
  children,
  onDismiss,
}: {
  tone: keyof typeof NOTICE_TONES;
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
}) {
  const t = NOTICE_TONES[tone];
  const Icon = t.icon;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${t.box}`}>
      <Icon className={`w-5 h-5 shrink-0 mt-px ${t.iconCls}`} />
      <div className="flex-1 min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'opacity-85' : 'font-medium'}>{children}</div>}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'good';
}) {
  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white py-14 px-8 text-center">
      <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${tone === 'good' ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F4EFDF] text-black/55'}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {children && <p className="text-sm text-black/55 mt-1 max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ── Status pill (dot + label) ─────────────────────────────────────────── */
const PILL_TONES = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-rose-50 text-rose-800 border-rose-200',
  neutral: 'bg-[#F4EFDF] text-black/70 border-black/[0.06]',
  ink: 'bg-black text-white border-black',
} as const;
const DOT_TONES = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', neutral: 'bg-black/35', ink: 'bg-white' } as const;

export type PillTone = keyof typeof PILL_TONES;

export function StatusPill({ tone, children, className = '' }: { tone: PillTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PILL_TONES[tone]} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_TONES[tone]}`} />
      {children}
    </span>
  );
}

/* ── Chip tabs (same look as the catalog genre filter) ─────────────────── */
export function ChipTabs<T extends string>({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; count?: number; icon?: LucideIcon }[];
  active: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="catalog-chips flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label={label}>
      {tabs.map(({ id, label: text, count, icon: Icon }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
              isActive ? 'bg-black text-white' : 'bg-white text-black/70 border border-black/10 hover:border-black/30 hover:text-black'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {text}
            {count !== undefined && (
              <span className={`tabular-nums text-xs rounded-full px-1.5 ${isActive ? 'bg-white/20' : 'bg-black/[0.06]'}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── Book cover thumbnail from just an id + title ─────────────────────── */
export function BookThumb({ id, title, author, year, className = 'w-16' }: { id: string | number; title: string; author?: string; year?: number | null; className?: string }) {
  return (
    <FlatBookCover
      className={`shrink-0 ${className}`}
      index={0}
      book={{ id: String(id), title, authors: author ? [author] : [], year: year ?? null, genres: [], jacket: '', available: 0, queue: 0, live: true }}
    />
  );
}

/* ── Label / value rows ───────────────────────────────────────────────── */
export function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">{label}</dt>
      <dd className="text-right text-sm font-medium min-w-0 break-words">{children}</dd>
    </div>
  );
}
