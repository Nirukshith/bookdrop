'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type FooterLink = { label: string; href: string };

const PERKS = ['Up to 5 loans at a time', 'Desk pickup in seconds', 'Fair first-in-line waitlists', 'Zero late fees'];

/** Landing-page footer: closing call to action, link columns and an oversized wordmark. */
export default function SiteFooter() {
  const { isAuthenticated, isStaff, isAdmin } = useAuth();

  const explore: FooterLink[] = [
    { label: 'Browse the catalog', href: '/catalog' },
    { label: 'How it works', href: '#how-it-works' },
  ];

  const members: FooterLink[] = isAuthenticated
    ? [
        { label: 'My dashboard', href: '/dashboard' },
        { label: 'Account settings', href: '/settings' },
      ]
    : [
        { label: 'Log in', href: '/login' },
        { label: 'Become a member', href: '/register' },
      ];

  const staff: FooterLink[] = [
    ...(isStaff
      ? [
          { label: 'Circulation desk', href: '/staff/desk' },
          { label: 'Returns desk', href: '/staff/returns' },
          { label: 'Inventory', href: '/staff/inventory' },
        ]
      : []),
    ...(isAdmin ? [{ label: 'Admin jobs', href: '/staff/admin' }] : []),
  ];

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="bg-brandYellow px-3 sm:px-5 pt-28 sm:pt-36 pb-3 sm:pb-5">
      <div className="relative overflow-hidden rounded-[2rem] sm:rounded-[2.75rem] bg-brandDark text-white">
        {/* Soft colour blobs */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden>
          <path d="M1440 0 C1250 40 1150 170 1220 300 C1290 430 1440 420 1440 420 Z" fill="#FCD44D" opacity="0.07" />
          <path d="M0 520 C140 480 260 560 240 700 C225 800 120 860 0 860 Z" fill="#E82B8A" opacity="0.08" />
        </svg>

        <div className="relative z-10 px-6 sm:px-10 lg:px-16 pt-14 sm:pt-20">
          {/* ── Closing call to action + link columns ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-10">
            <div className="lg:col-span-6 space-y-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Free with your library card
              </span>
              <h2 className="display-title text-[clamp(2.6rem,6vw,4.6rem)]">
                <span className="block">Your next chapter</span>
                <span className="block text-white/60">is on the shelf.</span>
              </h2>
              <p className="max-w-md text-base sm:text-lg font-medium text-white/70 leading-relaxed">
                Reserve what you want to read, pick it up at the desk, and bring it back when you&apos;re done. No fees, no fuss.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={isAuthenticated ? '/dashboard' : '/register'}
                  className="btn-pill group inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-sm font-black text-brandDark hover:bg-white/85 transition-colors"
                >
                  {isAuthenticated ? 'Go to my dashboard' : 'Become a member'}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/catalog"
                  className="btn-pill inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3.5 text-sm font-extrabold text-white hover:bg-white/10 transition-colors"
                >
                  Browse the catalog
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-3 gap-10 lg:pt-3">
              <FooterColumn title="Explore" links={explore} />
              <FooterColumn title="Members" links={members} />
              {staff.length ? (
                <FooterColumn title="Staff" links={staff} />
              ) : (
                <div className="col-span-2 sm:col-span-1">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">Good to know</h3>
                  <ul className="mt-5 space-y-3">
                    {PERKS.map((perk) => (
                      <li key={perk} className="flex items-start gap-2.5 text-sm font-semibold text-white/75">
                        <span className="mt-[7px] w-1.5 h-1.5 flex-shrink-0 rounded-full bg-brandPink" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* ── Bottom bar ── */}
          <div className="mt-16 sm:mt-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs font-semibold text-white/50">
            <p>© {new Date().getFullYear()} Bookdrop. A free public library service.</p>
            <button
              type="button"
              onClick={scrollToTop}
              className="group inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 font-bold text-white/80 hover:text-white hover:border-white/40 transition-colors"
            >
              Back to top
              <ArrowUp className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>

        {/* ── Oversized wordmark, cropped by the card edge ── */}
        <div
          aria-hidden
          className="relative z-0 select-none pointer-events-none font-heading uppercase leading-[0.78] text-center tracking-tight text-[clamp(4.5rem,19vw,17rem)] mt-6 -mb-[0.16em] bg-gradient-to-b from-white/25 to-white/0 bg-clip-text text-transparent"
        >
          Bookdrop
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h3 className="text-[11px] font-black uppercase tracking-[0.22em] text-white/60">{title}</h3>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group relative inline-block text-sm font-semibold text-white/75 hover:text-white transition-colors"
            >
              {link.label}
              <span className="absolute left-0 -bottom-0.5 h-px w-0 bg-white transition-all duration-300 group-hover:w-full" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
