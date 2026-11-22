'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type Step = {
  title: string;
  desc: string;
  bg: string;
  rot: string; // resting tilt
  y: string; // resting vertical offset
  art: React.ReactNode;
};

const STEPS: Step[] = [
  {
    title: 'Explore the shelf',
    desc: 'Browse thousands of titles, see live copy availability and place a hold in one tap. All copies out? Hop on the waitlist.',
    bg: '#6FE3EA',
    rot: '0deg',
    y: '0px',
    art: <ExploreArt />,
  },
  {
    title: 'Grab it at the desk',
    desc: 'Your copy is tagged and held at the circulation desk for 48 hours. Show your card, get scanned, and it’s yours.',
    bg: '#E955E8',
    rot: '2deg',
    y: '6px',
    art: <DeskArt />,
  },
  {
    title: 'Get lost in it',
    desc: 'Curl up with up to 5 reads at once. We’ll send you a friendly reminder before anything is due back.',
    bg: '#F5CF5F',
    rot: '5.5deg',
    y: '18px',
    art: <ReadArt />,
  },
  {
    title: 'Drop it & pass it on',
    desc: 'Return it at any returns desk. Once it’s checked, the next reader in line is notified automatically.',
    bg: '#9585D8',
    rot: '8deg',
    y: '-14px',
    art: <ReturnArt />,
  },
];

export default function HowItWorks() {
  const deckRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // Fan the cards in the first time the deck scrolls into view.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="hiw-section relative px-3 sm:px-5 py-5">
      <div className="hiw-shell relative overflow-hidden">
        {/* Soft blob shapes behind everything */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1440 1000" preserveAspectRatio="none" aria-hidden>
          <path d="M0 330 C200 270 380 300 520 420 C640 520 720 470 820 380 C940 270 1060 250 1180 330 C1290 400 1360 430 1440 410 L1440 1000 L0 1000 Z" fill="#FBEAFB" />
          <path d="M150 1000 C70 820 110 640 260 590 C380 550 450 640 420 760 C395 860 430 940 470 1000 Z" fill="#F4CFF5" />
          <path d="M1440 860 C1330 820 1250 880 1230 1000 L1440 1000 Z" fill="#F4CFF5" />
        </svg>

        {/* ── Heading row ── */}
        <div className="relative z-10 px-6 sm:px-10 lg:px-28 pt-10 sm:pt-12 lg:pt-16 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
          <div className="relative">
            <h2 className="display-title text-[3rem] sm:text-[4.6rem] lg:text-[6.2rem] text-black whitespace-nowrap">
              How it works
            </h2>
          </div>

          <div className="flex lg:flex-col items-center gap-6 lg:gap-8 lg:pr-4">
            <Link href="/register" className="hiw-split group">
              <span className="hiw-split__label">Become a member</span>
              <span className="hiw-split__arrow">
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>

        {/* ── Fanned card deck ── */}
        <div ref={deckRef} className={`hiw-deck relative z-10 ${inView ? 'is-in' : ''}`}>
          {STEPS.map((s, i) => (
            <article
              key={s.title}
              tabIndex={0}
              className="hiw-card"
              style={{ '--bg': s.bg, '--rot': s.rot, '--y': s.y, '--i': i } as React.CSSProperties}
            >
              <p className="font-handwriting text-[2rem] leading-none text-center">Step #{i + 1}</p>
              <div className="hiw-card__art">{s.art}</div>
              <h3 className="hiw-card__title">{s.title}</h3>
              <p className="hiw-card__desc">{s.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Line illustrations (original, drawn for BookDrop)
   ───────────────────────────────────────────────────────────────────── */
const ink = { stroke: '#111', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

function ExploreArt() {
  return (
    <svg viewBox="0 0 260 220" className="w-full h-full" aria-hidden>
      <g {...ink}>
        {/* stacked books */}
        <rect x="30" y="168" width="150" height="26" rx="4" fill="#fff" />
        <path d="M44 168v26M166 168v26" />
        <rect x="42" y="140" width="136" height="28" rx="4" fill="#111" />
        <path d="M60 154h70" stroke="#fff" />
        <rect x="36" y="112" width="128" height="28" rx="4" fill="#fff" />
        <path d="M50 112v28M70 126h60" />
        <path d="M120 112v-14l8 6 8-6v14" fill="#111" />
        {/* magnifying glass */}
        <circle cx="178" cy="78" r="44" fill="#fff" />
        <circle cx="178" cy="78" r="33" />
        <path d="M156 64c6-10 18-15 30-12" />
        <path d="M209 110l30 32" strokeWidth="13" />
        {/* sparkles */}
        <path d="M58 52v20M48 62h20" />
        <path d="M96 22v12M90 28h12" />
        <circle cx="236" cy="36" r="4" fill="#111" />
      </g>
    </svg>
  );
}

function DeskArt() {
  return (
    <svg viewBox="0 0 260 220" className="w-full h-full" aria-hidden>
      <g {...ink}>
        {/* counter */}
        <path d="M14 182h232" strokeWidth="5" />
        <path d="M30 182v26M230 182v26" />
        {/* service bell */}
        <path d="M40 176h70" strokeWidth="5" />
        <path d="M46 176c0-26 14-40 29-40s29 14 29 40" fill="#fff" />
        <path d="M75 136v-9M68 127h14" />
        <path d="M58 160c2-8 6-13 11-16" />
        {/* ding lines */}
        <path d="M36 128l-10-8M75 108v-12M114 128l10-8" />
        {/* hand holding a book with barcode */}
        <g transform="rotate(-12 180 100)">
          <rect x="138" y="40" width="88" height="116" rx="5" fill="#111" />
          <rect x="150" y="54" width="64" height="40" rx="3" fill="#fff" />
          <path d="M158 64v22M163 64v22M170 64v22M174 64v22M181 64v22M188 64v22M192 64v22M200 64v22M205 64v22" strokeWidth="2.2" />
          <path d="M156 116h50M156 128h34" stroke="#fff" />
        </g>
        <path d="M150 176c-4-18 2-32 16-40l20-6c8-2 14 4 10 11l-8 12 22-6c8-2 12 8 5 12l-30 17" fill="#fff" />
        <path d="M150 176h40" />
      </g>
    </svg>
  );
}

function ReadArt() {
  return (
    <svg viewBox="0 0 260 220" className="w-full h-full" aria-hidden>
      <g {...ink}>
        {/* open book */}
        <path d="M130 84c-24-16-58-20-96-12v104c38-8 72-4 96 12 24-16 58-20 96-12V72c-38-8-72-4-96 12z" fill="#fff" />
        <path d="M130 84v104" />
        <path d="M50 96c24-4 48-2 66 8M50 116c24-4 48-2 66 8M50 136c24-4 48-2 66 8" strokeWidth="2.4" />
        <path d="M144 104c18-10 42-12 66-8M144 124c18-10 42-12 66-8M144 144c18-10 42-12 66-8" strokeWidth="2.4" />
        <path d="M34 176c38-8 72-4 96 12 24-16 58-20 96-12v12c-38-8-72-4-96 12-24-16-58-20-96-12z" fill="#111" />
        {/* heart + stars floating out */}
        <path d="M130 52c-6-10-22-6-18 6 3 8 18 18 18 18s15-10 18-18c4-12-12-16-18-6z" fill="#111" />
        <path d="M78 34v16M70 42h16" />
        <path d="M188 28v16M180 36h16" />
        {/* mug */}
        <path d="M206 150h34v34c0 8-6 14-14 14h-6c-8 0-14-6-14-14z" fill="#111" />
        <path d="M240 160c10 0 12 16 0 18" />
        <path d="M216 138c-4-6 4-10 0-16M228 138c-4-6 4-10 0-16" />
      </g>
    </svg>
  );
}

function ReturnArt() {
  return (
    <svg viewBox="0 0 260 220" className="w-full h-full" aria-hidden>
      <g {...ink}>
        {/* returns box */}
        <path d="M46 96h112v104H46z" fill="#111" />
        <path d="M38 84h128v18H38z" fill="#fff" />
        <path d="M74 92h56" strokeWidth="6" />
        <path d="M70 130h64M70 150h40" stroke="#fff" />
        <path d="M60 200v10M144 200v10" />
        {/* book dropping into slot */}
        <g transform="rotate(18 104 50)">
          <rect x="82" y="22" width="44" height="58" rx="4" fill="#fff" />
          <path d="M90 22v58M98 40h20M98 50h14" />
        </g>
        <path d="M60 30l-8-8M150 34l10-8M70 60l-12 2" />
        {/* waitlist queue with cycle arrow */}
        <circle cx="200" cy="96" r="11" fill="#fff" />
        <path d="M182 136c0-14 8-22 18-22s18 8 18 22" fill="#fff" />
        <circle cx="236" cy="128" r="8" fill="#111" />
        <path d="M222 158c0-10 6-16 14-16s14 6 14 16" fill="#111" />
        <path d="M176 62c18-16 44-16 60 2" />
        <path d="M228 52l9 13-15 2" />
        <path d="M188 186c16 12 40 10 54-6" />
        <path d="M182 176l4 14 13-6" />
      </g>
    </svg>
  );
}
