'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Role } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  User as UserIcon,
  LogOut,
  LogIn,
  CheckCircle2,
  Clock,
  Sparkles,
  ShieldCheck,
  PackageCheck,
  RotateCcw,
  Boxes,
  Cpu,
  ChevronDown,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const { user, role, isStaff, isAuthenticated, logout, switchDemoUser } = useAuth();
  const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false);
  const [isDemoMenuOpen, setIsDemoMenuOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<Role | null>(null);

  if (pathname === '/') {
    return null;
  }

  const handleDemoSwitch = async (targetRole: Role) => {
    try {
      setSwitchingRole(targetRole);
      await switchDemoUser(targetRole);
      setIsDemoMenuOpen(false);
    } catch (err: any) {
      alert(`Could not switch to demo ${targetRole}: ${err.message}`);
    } finally {
      setSwitchingRole(null);
    }
  };

  const navLinkClass = (path: string) => {
    const isActive = pathname === path;
    return `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
        ? 'bg-indigo-50 text-indigo-700 font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`;
  };

  const roleBadgeVariant = (r: Role | null) => {
    if (r === 'ADMIN') return 'danger';
    if (r === 'LIBRARIAN') return 'warning';
    return 'default';
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 group-hover:scale-105 transition-transform">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg text-slate-900 tracking-tight flex items-center gap-1.5">
                  Bookdrop
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                    2.0
                  </span>
                </span>
                <span className="text-xs text-slate-500">Library Circulation Portal</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link href="/" className={navLinkClass('/')}>
                <BookOpen className="w-4 h-4" />
                Catalog
              </Link>

              {isAuthenticated && (
                <Link href="/dashboard" className={navLinkClass('/dashboard')}>
                  <Clock className="w-4 h-4" />
                  My Dashboard
                </Link>
              )}

              {/* Staff Desk dropdown */}
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
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Right actions: Demo Quick Switcher + User Profile */}
          <div className="flex items-center gap-3">
            {/* Quick Demo Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDemoMenuOpen(!isDemoMenuOpen)}
                onBlur={() => setTimeout(() => setIsDemoMenuOpen(false), 250)}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors shadow-sm"
                title="Switch demo persona without password"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Demo Switcher
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isDemoMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-xl py-2 z-50">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Switch Test Account
                  </div>
                  <button
                    type="button"
                    disabled={switchingRole !== null}
                    onClick={() => handleDemoSwitch('MEMBER')}
                    className="w-full text-left flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">Patron (Member)</div>
                      <div className="text-slate-500">patron@example.com</div>
                    </div>
                    {role === 'MEMBER' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    disabled={switchingRole !== null}
                    onClick={() => handleDemoSwitch('LIBRARIAN')}
                    className="w-full text-left flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">Circulation Librarian</div>
                      <div className="text-slate-500">librarian@example.com</div>
                    </div>
                    {role === 'LIBRARIAN' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    disabled={switchingRole !== null}
                    onClick={() => handleDemoSwitch('ADMIN')}
                    className="w-full text-left flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">System Administrator</div>
                      <div className="text-slate-500">admin@example.com</div>
                    </div>
                    {role === 'ADMIN' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                </div>
              )}
            </div>

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
                  onClick={() => logout()}
                  title="Sign Out"
                  className="text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="primary" size="sm">
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

