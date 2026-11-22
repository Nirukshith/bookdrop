'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import BookShelfCarousel from '@/components/landing/book-shelf-carousel';
import HowItWorks from '@/components/landing/how-it-works';
import SiteFooter from '@/components/landing/site-footer';
import { useConfirmLogout } from '@/components/auth/confirm-logout';
import {
  BookOpen,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  User as UserIcon,
  LogOut,
} from 'lucide-react';

export default function LandingPage() {
  const { user, isAuthenticated, isStaff } = useAuth();
  const { requestLogout, confirmLogoutDialog } = useConfirmLogout();

  return (
    <div className="w-full overflow-x-clip bg-brandYellow text-brandDark font-body landing-type selection:bg-brandOrange selection:text-white">
      {confirmLogoutDialog}
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
          <path d="M-100 450 C300 350,500 750,900 600 C1200 480,1400 700,1600 650 L1600 1000 L-100 1000Z" fill="#F8C42E" />
          <path d="M-100 250 C250 150,450 500,800 380 C1100 280,1350 450,1600 320 L1600 1000 L-100 1000Z" fill="#FEE378" opacity="0.65" />
          <path d="M400 900 C700 750,1000 850,1600 500 L1600 1000Z" fill="#FFF2AD" opacity="0.75" />
          <path d="M620 1000 C700 830 820 760 940 800 C1050 836 1120 900 1220 860 C1320 820 1380 760 1600 790 L1600 1000Z" fill="#EFA443" opacity="0.9" />
        </svg>

        {/* ── Header / Navigation ── */}
        <header className="relative z-30 px-6 lg:px-12 py-5 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="leading-none text-black">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                  <BookOpen className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-2xl font-black tracking-tight uppercase">Bookdrop</span>
              </div>
            </div>
          </Link>

          {/* Nav pills + auth */}
          <nav className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:flex items-center gap-1.5 bg-yellow-400/40 p-1 rounded-full backdrop-blur-sm border border-yellow-500/25 shadow-sm">
              <Link href="/catalog" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill">All Books</Link>
              <a href="#how-it-works" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill">How It Works</a>
              {isStaff && (
                <Link href="/staff/desk" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-800" />Staff Desk
                </Link>
              )}
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-white/95 px-4 py-2 rounded-full text-xs font-black text-gray-900 shadow-sm border border-white/60">
              <span className="text-base">🏛️</span>
              <span>100% Free Public Library</span>
            </div>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link href="/dashboard" className="px-5 py-2.5 bg-black text-white font-extrabold text-xs sm:text-sm rounded-full flex items-center gap-2 shadow-sm hover:bg-gray-800 transition-all btn-pill">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>{user?.name || 'Dashboard'}</span>
                </Link>
                <button onClick={() => requestLogout()} title="Sign out" className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-gray-800 shadow-sm transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link href="/login" className="px-5 py-2.5 bg-brandOrange text-gray-950 font-black text-xs sm:text-sm rounded-full flex items-center gap-2 shadow-sm hover:bg-orange-500 transition-all btn-pill">
                <span>Log-in / Sign-up</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}

          </nav>
        </header>

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
              <Link href="/login" className="inline-flex items-center gap-3 px-8 py-4 bg-brandPink text-white font-black text-sm sm:text-base rounded-full shadow-lg hover:bg-pink-600 transition-all btn-pill">
                <span>Log-in / Sign-up now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/catalog" className="inline-flex items-center gap-2 px-6 py-4 bg-white/90 hover:bg-white text-gray-950 font-extrabold text-sm sm:text-base rounded-full shadow-md transition-all btn-pill">
                <span>Explore Live Catalog</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
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
