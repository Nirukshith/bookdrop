'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Role } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePortalShell } from '@/components/portal-sidebar';
import { btnDark, btnOutline } from '@/components/portal/portal-ui';
import { useConfirmLogout } from '@/components/auth/confirm-logout';
import {
  BookOpen,
  User as UserIcon,
  LogOut,
  LogIn,
  Clock,
  ShieldCheck,
  PackageCheck,
  RotateCcw,
  Boxes,
  Cpu,
  ChevronDown,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { user, role, isStaff, isAdmin, isAuthenticated } = useAuth();
  const { requestLogout, confirmLogoutDialog } = useConfirmLogout();
  const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false);
  const inPortalShell = usePortalShell();

  // Signed-in app pages use the sidebar shell instead of the top navbar.
  if (pathname === '/' || inPortalShell) {
    return null;
  }

  const navLinkClass = (path: string) => {
    const isActive = pathname === path;
    return `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
        ? 'bg-black text-white font-semibold'
        : 'text-black/65 hover:text-black hover:bg-black/5'
      }`;
  };

  const roleBadgeVariant = (r: Role | null) => {
    if (r === 'ADMIN') return 'danger';
    if (r === 'LIBRARIAN') return 'warning';
    return 'default';
  };

  return (
    <>
    {confirmLogoutDialog}
    <header className="sticky top-0 z-40 w-full border-b border-black/[0.07] bg-[#FBF8EF]/90 backdrop-blur font-body">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-lg text-black tracking-tight uppercase">Bookdrop</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {isAuthenticated && (
                <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                  <Clock className="w-4 h-4" />
                  My Dashboard
                </Link>
              )}

              {/* Staff Desk dropdown (librarians & admins only) */}
              {isStaff && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsStaffMenuOpen(!isStaffMenuOpen)}
                    onBlur={() => setTimeout(() => setIsStaffMenuOpen(false), 200)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname?.startsWith('/staff')
                        ? 'bg-indigo-50 text-indigo-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                  >
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Staff Circulation Desk
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </button>
  
                  {isStaffMenuOpen && (
                    <div className="absolute left-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Circulation Desk
                      </div>
                      <Link
                        href="/staff/desk"
                        onClick={() => setIsStaffMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <PackageCheck className="w-4 h-4 text-emerald-600" />
                        <div>
                          <div className="font-medium">Pickup & Checkout Desk</div>
                          <div className="text-xs text-slate-500">Fulfill holds & walk-in checkouts</div>
                        </div>
                      </Link>
                      <Link
                        href="/staff/returns"
                        onClick={() => setIsStaffMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <RotateCcw className="w-4 h-4 text-amber-600" />
                        <div>
                          <div className="font-medium">Returns & Inspection</div>
                          <div className="text-xs text-slate-500">Checkin copy, inspect damage & fines</div>
                        </div>
                      </Link>
                      <div className="my-1 border-t border-slate-100" />
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Operations & Maintenance
                      </div>
                      <Link
                        href="/staff/inventory"
                        onClick={() => setIsStaffMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Boxes className="w-4 h-4 text-blue-600" />
                        <div>
                          <div className="font-medium">Inventory & Copies</div>
                          <div className="text-xs text-slate-500">Manage copies, barcodes & status</div>
                        </div>
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/staff/admin"
                          onClick={() => setIsStaffMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <Cpu className="w-4 h-4 text-indigo-600" />
                          <div>
                            <div className="font-medium">Admin & Job Leases</div>
                            <div className="text-xs text-slate-500">Leases, retry outbox, fines desk</div>
                          </div>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              )}
            </nav>
          </div>

          {/* Right actions: User Profile */}
          <div className="flex items-center gap-3">
            {/* Authenticated user pill or Sign In */}
            {isAuthenticated && user ? (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2 pl-2">
                  <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="hidden lg:flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-800 leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-slate-500 leading-tight">
                      {user.email}
                    </span>
                  </div>
                  <Badge variant={roleBadgeVariant(role)} className="hidden sm:inline-flex">
                    {role}
                  </Badge>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => requestLogout()}
                  title="Sign Out"
                  className="text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className={`${btnOutline} whitespace-nowrap px-4 py-2`}>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
                <Link href="/register" className={`${btnDark} whitespace-nowrap px-4 py-2`}>
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  );
}

