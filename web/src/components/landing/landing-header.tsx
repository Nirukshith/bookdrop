'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { BrandMark } from '@/components/brand-mark';
import { TransitionLink } from '@/components/page-transition';

const pill =
  'px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill';

/**
 * Header shared by the public pages (landing and live catalog): brand, nav
 * pills, and Sign in / Register. Moving between public pages plays the
 * paint-stroke transition.
 */
export default function LandingHeader({ onLanding = false }: { onLanding?: boolean }) {
  const { isStaff } = useAuth();

  const brand = (
    <span className="flex items-center gap-2 leading-none text-black">
      <BrandMark className="w-9 h-9 text-black group-hover:scale-105 transition-transform" />
      <span className="text-2xl font-black tracking-tight uppercase">Bookdrop</span>
    </span>
  );

  return (
    <header className="relative z-30 px-6 lg:px-12 py-5 flex items-center justify-between gap-3">
      {onLanding ? (
        <Link href="/" className="group">{brand}</Link>
      ) : (
        <TransitionLink href="/" className="group">{brand}</TransitionLink>
      )}

      <nav className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:flex items-center gap-1.5 bg-brandGreenDeep/50 p-1 rounded-full backdrop-blur-sm border border-[#7FC96A]/40 shadow-sm">
          {onLanding ? (
            <a href="#how-it-works" className={pill}>How It Works</a>
          ) : (
            <TransitionLink href="/#how-it-works" className={pill}>How It Works</TransitionLink>
          )}
          {isStaff && (
            <Link href="/staff/desk" className={`${pill} flex items-center gap-1.5`}>
              <ShieldCheck className="w-3.5 h-3.5 text-teal-800" />Staff Desk
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          <TransitionLink href="/login" className="px-5 py-2.5 bg-white/90 hover:bg-white text-gray-950 font-black text-xs sm:text-sm rounded-full shadow-sm transition-all btn-pill">
            Sign in
          </TransitionLink>
          <TransitionLink href="/register" className="px-5 py-2.5 bg-brandForest text-white font-black text-xs sm:text-sm rounded-full flex items-center gap-2 shadow-sm hover:bg-brandForestDark transition-all btn-pill">
            <span>Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </TransitionLink>
        </div>
      </nav>
    </header>
  );
}
