'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Shield, Heart } from 'lucide-react';

export function Footer() {
  const pathname = usePathname();
  if (pathname === '/') {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold text-slate-800">
              Bookdrop Library Circulation Engine
            </span>
            <span className="text-xs text-slate-400">· Next.js & NestJS GraphQL Monorepo</span>
          </div>

          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/" className="hover:text-indigo-600 transition-colors">
              Catalog
            </Link>
            <Link href="/dashboard" className="hover:text-indigo-600 transition-colors">
              Patron Dashboard
            </Link>
            <Link href="/staff/desk" className="hover:text-indigo-600 transition-colors">
              Pickup Desk
            </Link>
            <Link href="/staff/returns" className="hover:text-indigo-600 transition-colors">
              Returns Desk
            </Link>
            <Link href="/staff/admin" className="hover:text-indigo-600 transition-colors">
              Job Leases & Admin
            </Link>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <p>© {new Date().getFullYear()} Bookdrop. Built with transactional safety & state machine integrity.</p>
          <p className="flex items-center gap-1">
            Enterprise Circulation System <Shield className="w-3.5 h-3.5 text-emerald-500" />
          </p>
        </div>
      </div>
    </footer>
  );
}

