'use client';

import React from 'react';
import BookShelfCarousel from '@/components/landing/book-shelf-carousel';
import HowItWorks from '@/components/landing/how-it-works';
import SiteFooter from '@/components/landing/site-footer';
import LandingHeader from '@/components/landing/landing-header';
import { TransitionLink } from '@/components/page-transition';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="w-full overflow-x-clip bg-brandGreen text-brandDark font-body landing-type selection:bg-brandForest selection:text-white">
      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — HERO (Aardvark-inspired organic waves + 3D Book)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[92vh] flex flex-col justify-between overflow-x-clip">
        {/* Organic multi-layered SVG waves */}
        <svg
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
        >
          <path d="M-100 450 C300 350,500 750,900 600 C1200 480,1400 700,1600 650 L1600 1000 L-100 1000Z" fill="#A9DE8E" />
          <path d="M-100 250 C250 150,450 500,800 380 C1100 280,1350 450,1600 320 L1600 1000 L-100 1000Z" fill="#DDF5CC" opacity="0.65" />
          <path d="M400 900 C700 750,1000 850,1600 500 L1600 1000Z" fill="#EEF9E4" opacity="0.75" />
          <path d="M620 1000 C700 830 820 760 940 800 C1050 836 1120 900 1220 860 C1320 820 1380 760 1600 790 L1600 1000Z" fill="#7FC96A" opacity="0.9" />
        </svg>

        <LandingHeader onLanding />

        {/* ── Hero Content Grid ── */}
        <main className="relative z-20 px-6 lg:px-16 pt-6 pb-20 my-auto max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left text */}
          <div className="lg:col-span-7 space-y-6 pt-4 text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/5 border border-black/10 text-xs font-bold text-gray-900 backdrop-blur-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-Time Federated Circulation Supergraph
            </div>

            <h1 className="display-title text-[clamp(2.6rem,11vw,5.4rem)] text-black">
              <span className="block whitespace-nowrap">Borrow stories</span>
              <span className="block whitespace-nowrap">worth talking</span>
              <span className="block whitespace-nowrap">about</span>
            </h1>

            <p className="text-base sm:text-lg font-semibold text-gray-900 max-w-lg leading-snug">
              Join the modern library experience that&apos;s anything but traditional. Reserve up to 5 reads,
              pick up in seconds at your desk, or join waitlists with zero hassle — 100% free with your library card.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-4">
              <TransitionLink href="/books" className="inline-flex items-center gap-2 px-6 py-4 bg-white/90 hover:bg-white text-gray-950 font-extrabold text-sm sm:text-base rounded-full shadow-md transition-all btn-pill">
                <span>Explore Live Catalog</span>
                <ArrowRight className="w-4 h-4" />
              </TransitionLink>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-6 text-xs sm:text-sm font-bold text-gray-800">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Instant Desk Pickup</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Automated FIFO Waitlists</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Zero Late Fees on Returns</div>
            </div>
          </div>

        </main>

      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — THE SHELF (A24-style swipeable 3D books)
          ═══════════════════════════════════════════════════════════════════ */}
      <BookShelfCarousel />

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — HOW IT WORKS
          ═══════════════════════════════════════════════════════════════════ */}
      <HowItWorks />

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════════════════ */}
      <SiteFooter />
    </div>
  );
}
