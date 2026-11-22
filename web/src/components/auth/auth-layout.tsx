'use client';

import React, { useId, useState } from 'react';
import Image from 'next/image';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Eyebrow } from '@/components/portal/portal-ui';

/*
 * Shared layout for /login and /register in the landing page's look:
 * warm paper backdrop, a cream/yellow brand panel with fanned book covers,
 * Airone headings, Futura body text and pill buttons.
 */

/*
 * Art-print covers (public-domain Van Gogh paintings via Wikimedia Commons,
 * resized and bundled in /public/covers). Untitled on purpose: they are
 * decoration, not catalog entries.
 */
const FAN = [
  { src: '/covers/starry-night.jpg', pos: '30% 50%', cls: '-rotate-[9deg] translate-y-3' },
  { src: '/covers/sunflowers.jpg', pos: '50% 40%', cls: 'z-10 -translate-y-1' },
  { src: '/covers/almond-blossom.jpg', pos: '35% 50%', cls: 'rotate-[8deg] translate-y-4' },
];

/** A book-shaped art print: painting cropped to a cover, with spine shading and sheen. */
function ArtCover({ src, pos }: { src: string; pos: string }) {
  return (
    <div className="flat-cover">
      <div className="flat-cover__inner">
        <Image src={src} alt="" fill sizes="140px" className="object-cover" style={{ objectPosition: pos }} />
        <div className="shelf-book__hinge" />
        <div className="shelf-book__sheen" />
      </div>
    </div>
  );
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  aside,
  formTitle,
  formDescription,
  children,
  footer,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: React.ReactNode;
  /** Extra content under the brand copy (e.g. steps or perks). */
  aside?: React.ReactNode;
  formTitle: string;
  formDescription?: React.ReactNode;
  children: React.ReactNode;
  /** Line under the form, e.g. "Already have an account? Sign in". */
  footer?: React.ReactNode;
}) {
  return (
    <div className="font-body text-brandDark py-2 sm:py-6">
      {/* Warm paper backdrop for the whole page */}
      <div className="fixed inset-0 -z-10 bg-[#FBF8EF]" aria-hidden />

      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[28px] border border-black/[0.07] bg-white shadow-[0_24px_60px_-28px_rgba(17,17,17,0.35)] lg:grid-cols-[1.05fr_1fr]">
        {/* ── Brand panel ── */}
        <section className="catalog-hero relative flex flex-col px-6 py-8 sm:px-10 sm:py-10 lg:min-h-[640px]">
          <div className="lg:mt-6">
            <Eyebrow>{eyebrow}</Eyebrow>
            <h1 className="mt-4 font-heading text-[clamp(2.3rem,5vw,3.6rem)] leading-[0.95] tracking-[-0.01em]">
              {title}
            </h1>
            <div className="mt-3 max-w-md text-[15px] leading-relaxed text-black/70">{description}</div>
          </div>

          {/* Hidden on phones so the form isn't pushed below the fold */}
          {aside && <div className="mt-7 hidden sm:block">{aside}</div>}

          {/* Fanned covers (decorative, desktop only) */}
          <div className="pointer-events-none relative mt-auto hidden items-end justify-center gap-0 pt-10 lg:flex" aria-hidden>
            {FAN.map(({ src, pos, cls }) => (
              <div key={src} className={`-mx-3 w-[118px] drop-shadow-xl ${cls}`}>
                <ArtCover src={src} pos={pos} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Form panel ── */}
        <section className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
          <div className="mx-auto w-full max-w-sm">
            <h2 className="text-2xl font-bold tracking-tight">{formTitle}</h2>
            {formDescription && <p className="mt-1.5 text-sm text-black/60">{formDescription}</p>}
            <div className="mt-7">{children}</div>
            {footer && <p className="mt-8 text-center text-sm text-black/60">{footer}</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-black/[0.12] bg-white px-4 py-3 text-[15px] text-brandDark placeholder:text-black/35 transition-colors hover:border-black/25 focus:border-black focus:outline-none focus:ring-2 focus:ring-brandYellow';

export function AuthField({
  label,
  hint,
  icon: Icon,
  type = 'text',
  value,
  onChange,
  inputClassName = '',
  ...rest
}: {
  label: string;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  inputClassName?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-black/80">
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />}
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          className={`${inputCls} ${Icon ? 'pl-10' : ''} ${isPassword ? 'pr-11' : ''} ${inputClassName}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-black/45 hover:bg-black/5 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-black/50">
          {hint}
        </p>
      )}
    </div>
  );
}
