'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useConfirmLogout } from '@/components/auth/confirm-logout';
import { useUnreadNotifications } from '@/lib/use-unread-notifications';
import {
  BookOpen,
  Clock,
  PackageCheck,
  RotateCcw,
  Boxes,
  Cpu,
  BookMarked,
  Hourglass,
  ListOrdered,
  Receipt,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';

/** Routes that never get the portal shell, even when signed in. */
const NO_SHELL_ROUTES = ['/', '/login', '/register'];

/**
 * True when the current page should render inside the sidebar shell (any
 * signed-in user, on an app page). Navbar, footer and the main wrapper all use
 * this so they agree on which layout is active.
 */
export function usePortalShell(): boolean {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  return isAuthenticated && !NO_SHELL_ROUTES.includes(pathname ?? '/');
}

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };
type NavSection = { title?: string; items: NavItem[] };

const MEMBER_NAV: NavSection[] = [
  {
    items: [
      { href: '/catalog', label: 'Catalog', icon: BookOpen },
      { href: '/dashboard', label: 'Dashboard', icon: Clock },
    ],
  },
  {
    title: 'My Library',
    items: [
      { href: '/dashboard?tab=loans', label: 'Active Loans', icon: BookMarked },
      { href: '/dashboard?tab=holds', label: 'Desk Holds', icon: Hourglass },
      { href: '/dashboard?tab=queue', label: 'Waitlist Queue', icon: ListOrdered },
      { href: '/dashboard?tab=fines', label: 'Fines & Fees', icon: Receipt },
      { href: '/dashboard?tab=notifications', label: 'Notifications', icon: Bell },
    ],
  },
];

const STAFF_NAV: NavSection[] = [
  {
    items: [
      { href: '/catalog', label: 'Catalog', icon: BookOpen },
      { href: '/dashboard', label: 'Dashboard', icon: Clock },
    ],
  },
  {
    title: 'Circulation',
    items: [
      { href: '/staff/desk', label: 'Checkout Desk', icon: PackageCheck },
      { href: '/staff/returns', label: 'Return & Inspection', icon: RotateCcw },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/staff/inventory', label: 'Inventory & Copies', icon: Boxes },
      { href: '/staff/admin', label: 'Admin & Job Leases', icon: Cpu, adminOnly: true },
    ],
  },
];

const NOTIFICATIONS_HREF = '/dashboard?tab=notifications';

/** Count shown on the Notifications item; "9+" keeps the pill compact. */
function UnreadPill({ count }: { count: number }) {
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white tabular-nums">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function SidebarContent({
  onNavigate,
  unreadNotifications = 0,
}: {
  onNavigate?: () => void;
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, role, isAdmin, isStaff } = useAuth();
  const { requestLogout, confirmLogoutDialog } = useConfirmLogout();
  const sections = isStaff ? STAFF_NAV : MEMBER_NAV;

  // Links may carry a ?tab= query (member dashboard sections). A plain link is active on its
  // path; a tab link is active only when that tab is selected (no tab param = 'loans').
  // A plain link whose path also has tab links (Dashboard) defers to the matching tab link,
  // so only one item is highlighted at a time.
  const tabbedPaths = new Set(
    sections.flatMap((sec) => sec.items).filter((it) => it.href.includes('?')).map((it) => it.href.split('?')[0]),
  );

  const isActive = (href: string) => {
    const [path, query] = href.split('?');
    const onPath = pathname === path || pathname?.startsWith(`${path}/`);
    if (!query) return onPath && !tabbedPaths.has(path);
    const tab = new URLSearchParams(query).get('tab');
    return onPath && (searchParams.get('tab') ?? 'loans') === tab;
  };

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium transition-colors ${
      isActive(href)
        ? 'bg-black text-white font-semibold'
        : 'text-black/65 hover:text-black hover:bg-black/[0.05]'
    }`;

  return (
    <div className="flex h-full flex-col font-body text-brandDark">
      {confirmLogoutDialog}
      {/* Brand */}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-black/[0.07]"
      >
        <div className="w-9 h-9 rounded-lg bg-black flex items-center justify-center text-white shadow-sm">
          <BookOpen className="w-[18px] h-[18px]" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-extrabold uppercase tracking-tight">Bookdrop</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/50">{isStaff ? 'Staff Portal' : 'Member Portal'}</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Portal navigation">
        {sections.map((section, i) => {
          const items = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={section.title ?? i}>
              {section.title && (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
                  {section.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const unread = href === NOTIFICATIONS_HREF ? unreadNotifications : 0;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={onNavigate}
                        className={linkClass(href)}
                        aria-current={isActive(href) ? 'page' : undefined}
                        aria-label={unread > 0 ? `${label}, ${unread} new` : undefined}
                      >
                        <span className="relative shrink-0">
                          <Icon className="w-4 h-4" />
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-rose-600 ring-2 ring-[#FFFDF6]" aria-hidden />
                          )}
                        </span>
                        {label}
                        {unread > 0 && <UnreadPill count={unread} />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Account: settings, user, logout */}
      <div className="shrink-0 border-t border-black/[0.07] px-3 py-3 space-y-1">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={linkClass('/settings')}
          aria-current={isActive('/settings') ? 'page' : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>

        <button
          type="button"
          // Close the mobile drawer only once the user confirms.
          onClick={() => requestLogout(() => onNavigate?.())}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-full text-sm font-medium text-black/65 hover:text-rose-700 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logout
        </button>

        {user && (
          <div className="flex items-center gap-2.5 px-3 pt-3 mt-2 border-t border-black/[0.06]">
            <div className="w-8 h-8 shrink-0 rounded-full bg-brandYellow text-black flex items-center justify-center font-bold text-xs">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{user.name}</div>
              <div className="text-[10px] text-black/50 truncate">{user.email}</div>
            </div>
            <span className="shrink-0 rounded-full bg-black px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {role}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Two-column portal layout: persistent sidebar on desktop, slide-over drawer on mobile. */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isStaff, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  // Notifications are member-facing; staff have no notifications page.
  const { count: unreadNotifications } = useUnreadNotifications(isAuthenticated && !isStaff);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="flex flex-1 w-full min-h-screen bg-[#FBF8EF]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-black/[0.07] bg-[#FFFDF6]">
        <div className="sticky top-0 h-screen">
          <Suspense fallback={null}>
            <SidebarContent unreadNotifications={unreadNotifications} />
          </Suspense>
        </div>
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#FFFDF6] shadow-xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-full text-black/55 hover:bg-black/[0.05]"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
            <Suspense fallback={null}>
              <SidebarContent onNavigate={() => setIsOpen(false)} unreadNotifications={unreadNotifications} />
            </Suspense>
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-4 border-b border-black/[0.07] bg-[#FBF8EF]/90 backdrop-blur font-body">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="p-1.5 -ml-1.5 rounded-full text-black/70 hover:bg-black/[0.05]"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-extrabold uppercase tracking-tight">Bookdrop</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/50">{isStaff ? 'Staff Portal' : 'Member Portal'}</span>
          {!isStaff && (
            <Link
              href={NOTIFICATIONS_HREF}
              className="relative ml-auto p-1.5 -mr-1.5 rounded-full text-black/70 hover:bg-black/[0.05]"
              aria-label={unreadNotifications > 0 ? `Notifications, ${unreadNotifications} new` : 'Notifications'}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white ring-2 ring-[#FBF8EF]">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Link>
          )}
        </div>

        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
