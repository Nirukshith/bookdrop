'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';

/*
 * Paint-stroke page transition.
 *
 * Leave: one fat brush stroke draws itself across the screen while its width
 * swells until it covers everything, and the logo pops in. The route changes
 * underneath. Enter: the logo spins away and the stroke un-draws from its tail,
 * thinning out as it goes, revealing the new page.
 *
 * The path lives in a 1080×1080 box stretched to the viewport. At 70% stroke
 * width (≈378 units either side of the line) every point of the box is
 * covered with room to spare, so nothing peeks through at the peak.
 */
const STROKE_PATH =
  'M 60 -100 C -20 420 40 1000 200 1060 C 380 1120 220 80 400 60 C 600 40 420 1000 600 1080 C 760 1150 700 120 840 40 C 980 -40 1000 600 1160 1180';
const THIN = 8; // % stroke width while drawing
const FULL = 70; // % stroke width once it covers the screen
const LEAVE_MS = 1250;
const ENTER_MS = 1250;

/* ── Easing ─────────────────────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const inQuad = (t: number) => t * t;
const outCirc = (t: number) => Math.sqrt(1 - Math.pow(t - 1, 2));
/** Elastic out with amplitude 1 and period 0.72: a springy overshoot. */
const outElastic = (t: number) => {
  if (t === 0 || t === 1) return t;
  const p = 0.72;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
};
const inElastic = (t: number) => 1 - outElastic(1 - t);

/** Runs `onUpdate(progress)` every frame for `ms` (after `delay` ms); resolves when done. */
function tween(ms: number, onUpdate: (t: number) => void, delay = 0): Promise<void> {
  return new Promise((resolve) => {
    let start: number | null = null;
    const frame = (now: number) => {
      if (start === null) start = now + delay;
      const t = clamp01((now - start) / ms);
      if (now >= start) onUpdate(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/* ── Context ────────────────────────────────────────────────────────────── */
type TransitionApi = { navigate: (href: string) => void };
const TransitionContext = createContext<TransitionApi | null>(null);

export function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const pathnameRef = useRef(pathname);
  const arrival = useRef<{ target: string; resolve: () => void } | null>(null);

  // Resolve the pending navigation once the router has actually rendered the new route.
  useEffect(() => {
    pathnameRef.current = pathname;
    if (arrival.current && arrival.current.target === pathname) {
      arrival.current.resolve();
      arrival.current = null;
    }
  }, [pathname]);

  const setStroke = (visibleFrom: number, visibleTo: number, widthPct: number) => {
    const path = pathRef.current;
    if (!path) return;
    const len = Math.max(0, visibleTo - visibleFrom);
    path.style.opacity = len > 0.0001 ? '1' : '0';
    path.style.strokeDasharray = `${len} 2`;
    path.style.strokeDashoffset = `${-visibleFrom}`;
    path.style.strokeWidth = `${widthPct}%`;
  };

  const setLogo = (scale: number, rotate: number, opacity: number) => {
    const logo = logoRef.current;
    if (!logo) return;
    logo.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`;
    logo.style.opacity = String(clamp01(opacity));
  };

  const leave = useCallback(async () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setStroke(0, 0, THIN);
    setLogo(0, -64, 0);
    wrap.dataset.active = 'true';

    await Promise.all([
      // Draw the stroke (done at 90%), then swell it to full width over the rest.
      tween(LEAVE_MS, (t) => {
        const drawn = inOutCubic(clamp01(t / 0.9));
        const swell = inQuad(clamp01((t - 0.15) / 0.85));
        setStroke(0, drawn, lerp(THIN, FULL, swell));
      }),
      // Logo pops in partway through.
      tween(650, (t) => setLogo(outElastic(t), lerp(-64, 0, outElastic(t)), t * 3), 500),
    ]);
  }, []);

  const enter = useCallback(async () => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    await Promise.all([
      // Logo spins out.
      tween(600, (t) => {
        const e = inElastic(t);
        setLogo(1 - e, 64 * e, 1 - t * t);
      }, 150),
      // Stroke un-draws from its tail while thinning back down.
      tween(ENTER_MS, (t) => {
        const from = inOutCubic(t);
        const thin = outCirc(clamp01(t / 0.95));
        setStroke(from, 1, lerp(FULL, THIN, thin));
      }, 450),
    ]);

    delete wrap.dataset.active;
    setStroke(0, 0, THIN);
  }, []);

  const navigate = useCallback(
    async (href: string) => {
      if (busy.current) return;
      const url = new URL(href, window.location.href);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const samePage = url.pathname === pathnameRef.current;

      if (reduced || samePage) {
        router.push(href);
        return;
      }

      busy.current = true;
      try {
        router.prefetch(href);
        await leave();

        const arrived = new Promise<void>((resolve) => {
          arrival.current = { target: url.pathname, resolve };
        });
        router.push(href);
        // Wait for the new route to render (with a safety net so the overlay never sticks).
        await Promise.race([arrived, wait(5000)]);
        arrival.current = null;
        await nextPaint();
        // Jump (not smooth-scroll; <html> has scroll-smooth) while the screen is still covered.
        if (!url.hash) window.scrollTo({ top: 0, behavior: 'instant' });

        await enter();
      } finally {
        busy.current = false;
      }
    },
    [router, leave, enter],
  );

  return (
    <TransitionContext.Provider value={{ navigate }}>
      {children}
      <div ref={wrapRef} className="page-transition" aria-hidden>
        <svg className="page-transition__svg" viewBox="0 0 1080 1080" preserveAspectRatio="none" fill="none">
          <path
            ref={pathRef}
            d={STROKE_PATH}
            pathLength={1}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0 }}
          />
        </svg>
        <div ref={logoRef} className="page-transition__logo">
          <BrandMark className="w-full h-full text-brandMint" innerColor="#1F4D2E" />
        </div>
      </div>
    </TransitionContext.Provider>
  );
}

/** Starts a paint-stroke transition to `href`. Falls back to a plain push outside the provider. */
export function usePageTransition() {
  const ctx = useContext(TransitionContext);
  const router = useRouter();
  return ctx ?? { navigate: (href: string) => router.push(href) };
}

type TransitionLinkProps = React.ComponentProps<typeof Link> & { href: string };

/** A next/link that plays the paint-stroke transition on a plain left click. */
export function TransitionLink({ href, onClick, ...rest }: TransitionLinkProps) {
  const { navigate } = usePageTransition();
  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          rest.target === '_blank'
        ) {
          return;
        }
        e.preventDefault();
        navigate(href);
      }}
      {...rest}
    />
  );
}
