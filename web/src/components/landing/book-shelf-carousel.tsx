'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TransitionLink } from '@/components/page-transition';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { fetchGraphQL } from '@/lib/graphql-client';
import { useAuth } from '@/lib/auth-context';
import { BOOKS_QUERY } from '@/lib/graphql-queries';
import type { Book } from '@/lib/types';
import { Book3D } from './book-3d';
import { SAMPLE_SHELF, availabilityLabel, fromApiBook, type ShelfBook } from './shelf-data';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Spacing between books along the diagonal, as a multiple of book width. */
const SPACING = 1.62;

interface Physics {
  pos: number; // continuous index currently rendered
  target: number; // index we are easing towards
  dragging: boolean;
  moved: boolean;
  startX: number;
  startY: number;
  startPos: number;
  lastX: number;
  lastT: number;
  vel: number; // px per ms
  downIndex: number | null;
  rendered: number;
  bw: number;
  visible: boolean;
  wheelTimer: ReturnType<typeof setTimeout> | null;
}

export default function BookShelfCarousel() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [books, setBooks] = useState<ShelfBook[]>(SAMPLE_SHELF);
  const [isLive, setIsLive] = useState(false);
  const [active, setActive] = useState(2);
  const [cursor, setCursor] = useState<{ show: boolean; label: 'Drag' | 'Open' | 'Pick' }>({ show: false, label: 'Drag' });

  const stageRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeRef = useRef(2);
  const reduceMotion = useRef(false);
  const phys = useRef<Physics>({
    pos: 2, target: 2, dragging: false, moved: false, startX: 0, startY: 0, startPos: 0,
    lastX: 0, lastT: 0, vel: 0, downIndex: null, rendered: NaN, bw: 220, visible: true, wheelTimer: null,
  });

  const count = books.length;
  const current = books[clamp(active, 0, count - 1)];

  /* ── Live catalog (falls back to the sample shelf) ─────────────────── */
  useEffect(() => {
    let cancelled = false;
    fetchGraphQL<{ books: Book[] }>(BOOKS_QUERY, { take: 14 }, { skipAuth: true })
      .then((data) => {
        if (cancelled) return;
        const live = (data?.books ?? []).map(fromApiBook);
        if (live.length >= 4) {
          setBooks(live);
          setIsLive(true);
        }
      })
      .catch(() => {
        /* API offline — keep the sample shelf */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep position valid whenever the book list changes.
  useEffect(() => {
    const p = phys.current;
    const start = Math.min(2, count - 1);
    p.pos = p.target = start;
    p.rendered = NaN;
    activeRef.current = start;
    setActive(start);
  }, [count]);

  /* ── Sizing ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resize = () => {
      const w = window.innerWidth;
      const bw = w < 640 ? clamp(w * 0.4, 130, 180) : clamp(w * 0.155, 160, 250);
      phys.current.bw = bw;
      phys.current.rendered = NaN;
      stageRef.current?.style.setProperty('--bw', `${bw}px`);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Pause the render loop while the section is off-screen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      phys.current.visible = entry.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Render loop ────────────────────────────────────────────────────── */
  const layout = useCallback((pos: number) => {
    const bw = phys.current.bw;
    const items = itemRefs.current;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (!el) continue;
      const d = i - pos;
      const ad = Math.abs(d);
      const t = Math.min(ad, 1); // 0 = front & centre, 1 = neighbour or further
      const side = d < 0 ? -1 : 1;

      // Books travel along a rising diagonal (low-left → high-right), like the A24 discs.
      const x = d * bw * SPACING;
      const y = -d * bw * 0.36 - (1 - t) * bw * 0.1;
      const z = -Math.min(ad, 4) * bw * 0.5;
      const rx = lerp(6, 36, t);
      const ry = lerp(-14, -14 - side * 16, t);
      const rz = lerp(-7, -21, t);
      const s = lerp(1.14, 0.95, t);

      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, ${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      el.style.zIndex = String(1000 - Math.round(ad * 10));
      el.style.opacity = ad > 3.2 ? String(Math.max(0, 1 - (ad - 3.2) * 1.5)) : '1';
      el.style.visibility = ad > 4 ? 'hidden' : 'visible';
      el.classList.toggle('is-active', ad < 0.5);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const p = phys.current;
      if (!p.dragging) {
        const k = reduceMotion.current ? 1 : 1 - Math.exp(-dt * 8.5);
        p.pos += (p.target - p.pos) * k;
        if (Math.abs(p.target - p.pos) < 0.0004) p.pos = p.target;
      }
      if (p.visible && p.pos !== p.rendered) {
        layout(p.pos);
        p.rendered = p.pos;
      }
      const idx = clamp(Math.round(p.pos), 0, count - 1);
      if (idx !== activeRef.current) {
        activeRef.current = idx;
        setActive(idx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, layout]);

  /* ── Navigation helpers ─────────────────────────────────────────────── */
  const goTo = useCallback(
    (i: number) => {
      phys.current.target = clamp(Math.round(i), 0, count - 1);
    },
    [count],
  );
  const step = useCallback((dir: number) => goTo(phys.current.target + dir), [goTo]);

  const openBook = useCallback(
    (i: number) => {
      const b = books[i];
      if (!b) return;
      router.push(`/catalog?search=${encodeURIComponent(b.title)}`);
    },
    [books, router],
  );

  /* ── Pointer: drag / swipe / flick ──────────────────────────────────── */
  const indexFromTarget = (target: EventTarget | null): number | null => {
    const el = (target as HTMLElement | null)?.closest?.('[data-index]') as HTMLElement | null;
    return el ? Number(el.dataset.index) : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = phys.current;
    p.dragging = true;
    p.moved = false;
    p.startX = p.lastX = e.clientX;
    p.startY = e.clientY;
    p.startPos = p.pos;
    p.lastT = performance.now();
    p.vel = 0;
    p.downIndex = indexFromTarget(e.target);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = phys.current;

    // Custom cursor follows the pointer (mouse only).
    if (e.pointerType === 'mouse' && cursorRef.current && stageRef.current) {
      const r = stageRef.current.getBoundingClientRect();
      cursorRef.current.style.transform = `translate3d(${e.clientX - r.left}px, ${e.clientY - r.top}px, 0)`;
      const hovered = indexFromTarget(e.target);
      const label: 'Drag' | 'Open' | 'Pick' = p.dragging && p.moved
        ? 'Drag'
        : hovered === null ? 'Drag' : hovered === activeRef.current ? 'Open' : 'Pick';
      setCursor((c) => (c.show && c.label === label ? c : { show: true, label }));
    }

    if (!p.dragging) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (!p.moved && Math.hypot(dx, dy) > 6) p.moved = true;

    // Project the drag onto the diagonal path so up-right drags feel natural too.
    const travel = dx - dy * 0.35;
    let next = p.startPos - (travel / (p.bw * SPACING)) * 1.1;
    const max = count - 1;
    if (next < 0) next *= 0.3; // rubber-band at the ends
    if (next > max) next = max + (next - max) * 0.3;
    p.pos = p.target = next;

    const now = performance.now();
    const v = (e.clientX - p.lastX) / Math.max(1, now - p.lastT);
    p.vel = p.vel * 0.55 + v * 0.45;
    p.lastX = e.clientX;
    p.lastT = now;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const p = phys.current;
    if (!p.dragging) return;
    p.dragging = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (!p.moved && !cancelled) {
      const i = p.downIndex;
      if (i !== null) {
        if (i === activeRef.current) openBook(i);
        else goTo(i);
      } else {
        goTo(p.pos);
      }
      return;
    }
    // Flick: project momentum forward, then snap to the nearest book.
    const fling = (-p.vel * 260) / (p.bw * SPACING);
    goTo(p.pos + clamp(fling, -4, 4));
  };

  /* ── Trackpad horizontal scroll ─────────────────────────────────────── */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return; // vertical wheel keeps scrolling the page
      e.preventDefault();
      const p = phys.current;
      p.target = clamp(p.target + dx / (p.bw * SPACING), -0.3, count - 0.7);
      if (p.wheelTimer) clearTimeout(p.wheelTimer);
      p.wheelTimer = setTimeout(() => goTo(p.target), 140);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, goTo]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(count - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); openBook(activeRef.current); }
  };

  if (!current) return null;

  return (
    <section id="shelf" className="shelf-section relative text-[#111]" aria-label="Featured books">
      {/* Soft wave hand-off from the green hero (same cream as the section) */}
      <svg className="absolute left-0 right-0 top-0 w-full h-16 sm:h-24 -translate-y-[98%] pointer-events-none" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden>
        <path d="M0 60 C240 10 420 95 720 55 C1000 18 1220 85 1440 40 L1440 100 L0 100 Z" fill="#EEF9E4" />
      </svg>

      <div className="relative min-h-[100svh] lg:min-h-[880px] flex flex-col overflow-hidden">
        {/* Wave hand-off into the green How-it-works section. First child so the
            books on the stage paint over it. */}
        <svg className="absolute left-0 right-0 bottom-0 w-full h-28 sm:h-40 pointer-events-none" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden>
          <path d="M0 110 C220 60 420 140 700 96 C980 52 1200 120 1440 70 L1440 160 L0 160 Z" fill="#A9DE8E" opacity="0.55" />
          <path d="M0 130 C260 92 460 160 760 122 C1040 88 1240 140 1440 108 L1440 160 L0 160 Z" fill="#CDEFB8" />
        </svg>
        {/* ── Top bar: details (left) · counter (right) ── */}
        <div className="relative z-[1100] px-4 sm:px-6 lg:px-4 pt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,500px)_1fr_minmax(0,500px)] gap-5 items-start pointer-events-none">
          {/* Book details, A24 credit-sheet style */}
          <div key={current.id} className="shelf-fade pointer-events-auto order-2 lg:order-1 max-w-[500px]">
            <h3 className="font-heading uppercase leading-[0.9] tracking-[-0.01em] text-[2.2rem] sm:text-[2.8rem] lg:text-[3.4rem] pb-2 border-b border-black/70">
              {current.title}
            </h3>
            <dl className="text-[15px] sm:text-[17px]">
              <CreditRow label="Written by" values={current.authors.length ? current.authors : ['Unknown']} />
              {current.year ? <CreditRow label="Published" values={[String(current.year)]} /> : null}
              {current.genres.length ? <CreditRow label="Genre" values={current.genres.slice(0, 3)} /> : null}
              <CreditRow label="On the shelf" values={[availabilityLabel(current)]} highlight={current.available > 0 ? 'in' : 'out'} />
            </dl>
          </div>


          {/* Counter */}
          <div className="hidden lg:flex lg:col-start-3 order-3 flex-col items-end gap-1 pt-1">
            <span className="font-heading text-3xl tabular-nums">
              {String(active + 1).padStart(2, '0')}
              <span className="text-black/35"> / {String(count).padStart(2, '0')}</span>
            </span>
            {!isLive && <span className="text-[10px] uppercase tracking-[0.22em] text-black/45">Sample shelf</span>}
          </div>
        </div>

        {/* ── Stage ── */}
        <div
          ref={stageRef}
          className="shelf-stage relative flex-1 min-h-[440px] sm:min-h-[520px] lg:-mt-24 outline-none"
          role="listbox"
          tabIndex={0}
          aria-label="Books — drag, swipe or use arrow keys"
          aria-activedescendant={`shelf-item-${current.id}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e)}
          onPointerCancel={(e) => endDrag(e, true)}
          onPointerLeave={() => setCursor((c) => ({ ...c, show: false }))}
          onKeyDown={onKeyDown}
        >
          {books.map((b, i) => (
            <div
              key={b.id}
              id={`shelf-item-${b.id}`}
              ref={(el) => { itemRefs.current[i] = el; }}
              data-index={i}
              role="option"
              aria-selected={i === active}
              aria-label={`${b.title} by ${b.authors.join(', ')}`}
              className="shelf-item"
            >
              <Book3D book={b} index={i} />
            </div>
          ))}

          {/* Custom cursor bubble (desktop) */}
          <div ref={cursorRef} className={`shelf-cursor ${cursor.show ? 'is-visible' : ''}`} aria-hidden>
            <span className={`shelf-cursor__dot ${cursor.label === 'Open' ? 'is-open' : ''}`}>
              {cursor.label === 'Drag' ? '‹ Drag ›' : cursor.label === 'Open' ? 'Open' : 'View'}
            </span>
          </div>
        </div>

        {/* ── Bottom: controls · CTA ── */}
        <div className="relative z-[1100] px-4 sm:px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-end gap-6">
          <div className="flex items-center gap-3 order-2 lg:order-1 justify-center lg:justify-start">
            <button type="button" onClick={() => step(-1)} disabled={active === 0} aria-label="Previous book" className="shelf-arrow">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => step(1)} disabled={active === count - 1} aria-label="Next book" className="shelf-arrow">
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.24em] text-black/50 ml-2">Drag · Swipe · ← →</span>
          </div>

          <div className="order-3 lg:col-start-3 flex items-center justify-center lg:justify-end gap-3">
            <span className="lg:hidden font-heading text-2xl tabular-nums">
              {String(active + 1).padStart(2, '0')}<span className="text-black/35"> / {String(count).padStart(2, '0')}</span>
            </span>
            <TransitionLink
              // Holds need an approved membership, so visitors register first.
              href={isAuthenticated ? `/catalog?search=${encodeURIComponent(current.title)}` : '/register'}
              className="btn-pill inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black text-white font-extrabold text-sm"
            >
              {current.available > 0 ? 'Reserve this book' : 'Join the waitlist'}
              <ArrowRight className="w-4 h-4" />
            </TransitionLink>
          </div>
        </div>

        {/* Progress ticks */}
        <div className="relative z-[1100] flex justify-center gap-1.5 pb-6">
          {books.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${b.title}`}
              className={`h-[3px] rounded-full transition-all duration-300 ${i === active ? 'w-8 bg-black' : 'w-3 bg-black/20 hover:bg-black/45'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CreditRow({ label, values, highlight }: { label: string; values: string[]; highlight?: 'in' | 'out' }) {
  return (
    <div className="flex justify-between gap-6 py-2 border-b border-black/70">
      <dt className="text-[10px] sm:text-[11px] uppercase tracking-[0.24em] pt-1.5 shrink-0">{label}</dt>
      <dd className="text-right leading-[1.35]">
        {values.map((v) => (
          <div key={v} className="flex items-center justify-end gap-2">
            {highlight && <span className={`w-1.5 h-1.5 rounded-full ${highlight === 'in' ? 'bg-emerald-600' : 'bg-brandCamel'}`} />}
            {v}
          </div>
        ))}
      </dd>
    </div>
  );
}
