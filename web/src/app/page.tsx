'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Book, Role } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  BOOKS_QUERY,
  REQUEST_HOLD_MUTATION,
  JOIN_QUEUE_MUTATION,
} from '@/lib/graphql-queries';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatCurrency } from '@/lib/utils';
import {
  Search,
  BookOpen,
  Calendar,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
  BookmarkPlus,
  BookmarkCheck,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  PackageCheck,
  RotateCcw,
  Boxes,
  Cpu,
  ChevronDown,
  Shield,
  Heart,
  ExternalLink,
  User as UserIcon,
  LogOut,
} from 'lucide-react';

export default function LandingPage() {
  const { user, isAuthenticated, isStaff, role, switchDemoUser, logout } = useAuth();

  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo menu dropdown in header
  const [isDemoMenuOpen, setIsDemoMenuOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState<Role | null>(null);

  // Selected book for details modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const loadBooks = useCallback(async (query: string = '') => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchGraphQL<{ books: Book[] }>(BOOKS_QUERY, {
        search: query.trim() || undefined,
        take: 50,
      });
      setBooks(data.books || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load books catalog');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadBooks(search);
  };

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => {
      b.categories?.forEach((c) => {
        if (c.name) set.add(c.name);
      });
    });
    return ['All', ...Array.from(set)];
  }, [books]);

  const filteredBooks = useMemo(() => {
    if (selectedCategory === 'All') return books;
    return books.filter((b) =>
      b.categories?.some((c) => c.name === selectedCategory)
    );
  }, [books, selectedCategory]);

  const handleRequestHold = async (book: Book) => {
    if (!isAuthenticated) {
      try {
        await switchDemoUser('MEMBER');
      } catch (err: any) {
        setActionError('Please sign in to place a hold: ' + err.message);
        return;
      }
    }
    try {
      setIsActionLoading(true);
      setActionError(null);
      setActionSuccess(null);
      const res = await fetchGraphQL<{
        requestHold: { id: string; copyBarcode?: string; expiresAt: string };
      }>(REQUEST_HOLD_MUTATION, { bookId: parseInt(book.id, 10) });
      const expires = new Date(res.requestHold.expiresAt).toLocaleString();
      setActionSuccess(
        `Hold confirmed! Copy ${res.requestHold.copyBarcode || ''} reserved at pickup desk until ${expires}.`
      );
      loadBooks(search);
    } catch (err: any) {
      setActionError(err.message || 'Could not place hold on this item.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleJoinQueue = async (book: Book) => {
    if (!isAuthenticated) {
      try {
        await switchDemoUser('MEMBER');
      } catch (err: any) {
        setActionError('Please sign in to join queue: ' + err.message);
        return;
      }
    }
    try {
      setIsActionLoading(true);
      setActionError(null);
      setActionSuccess(null);
      const res = await fetchGraphQL<{
        joinReservationQueue: { id: string; position: number };
      }>(JOIN_QUEUE_MUTATION, { bookId: parseInt(book.id, 10) });
      setActionSuccess(
        `Joined queue! You are position #${res.joinReservationQueue.position} in line.`
      );
      loadBooks(search);
    } catch (err: any) {
      setActionError(err.message || 'Could not join reservation queue.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="w-full bg-brandYellow text-brandDark font-sans selection:bg-brandOrange selection:text-white">
      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 1 — HERO (Aardvark-inspired organic waves + 3D Book)
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative min-h-[92vh] flex flex-col justify-between overflow-hidden">
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
        </svg>

        {/* Tilted teal corner accent */}
        <div className="teal-book-accent hidden sm:block pointer-events-none z-10" />

        {/* ── Header / Navigation ── */}
        <header className="relative z-30 px-6 lg:px-12 py-5 flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="leading-none text-black">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-black text-brandYellow flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                  <BookOpen className="w-4 h-4 stroke-[2.5]" />
                </div>
                <span className="text-2xl font-black tracking-tight uppercase">Bookdrop</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black text-brandYellow uppercase tracking-wider">2.0</span>
              </div>
              <span className="text-[10px] tracking-[0.28em] font-extrabold block pl-10 -mt-1 uppercase text-gray-800">
                CIRCULATION ENGINE
              </span>
            </div>
          </Link>

          {/* Nav pills + auth */}
          <nav className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:flex items-center gap-1.5 bg-yellow-400/40 p-1 rounded-full backdrop-blur-sm border border-yellow-500/25 shadow-sm">
              <a href="#catalog" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill">All Books</a>
              <a href="#how-it-works" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill">How It Works</a>
              <Link href="/staff/desk" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-800" />Staff Desk
              </Link>
              <a href="#faq" className="px-4 py-2 text-xs lg:text-sm font-extrabold text-gray-900 rounded-full hover:bg-white/90 transition-all btn-pill">FAQ</a>
            </div>

            <div className="hidden lg:flex items-center gap-2 bg-white/95 px-4 py-2 rounded-full text-xs font-black text-gray-900 shadow-sm border border-white/60">
              <span className="text-base">🏛️</span>
              <span>100% Free Public Library</span>
            </div>

            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link href="/dashboard" className="px-5 py-2.5 bg-black text-brandYellow font-extrabold text-xs sm:text-sm rounded-full flex items-center gap-2 shadow-sm hover:bg-gray-800 transition-all btn-pill">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>{user?.name || 'Dashboard'}</span>
                </Link>
                <button onClick={logout} title="Sign out" className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-gray-800 shadow-sm transition-all">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link href="/login" className="px-5 py-2.5 bg-brandOrange text-gray-950 font-black text-xs sm:text-sm rounded-full flex items-center gap-2 shadow-sm hover:bg-orange-500 transition-all btn-pill">
                <span>Log-in / Sign-up</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {/* Demo switcher */}
            <div className="relative">
              <button type="button" onClick={() => setIsDemoMenuOpen(!isDemoMenuOpen)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-black/15 bg-white/80 hover:bg-white text-xs font-bold text-gray-900 shadow-sm transition-all">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Demo</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {isDemoMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white shadow-xl border border-gray-100 py-2 z-50 text-xs text-gray-800">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">Switch Test Persona</div>
                  {(['MEMBER', 'LIBRARIAN', 'ADMIN'] as Role[]).map((r) => (
                    <button key={r} onClick={() => handleDemoSwitch(r)} className="w-full text-left px-3 py-2 hover:bg-amber-50 flex items-center justify-between font-semibold">
                      <span>{r === 'MEMBER' ? 'Patron (Reader)' : r === 'LIBRARIAN' ? 'Circulation Desk' : 'Chief Administrator'}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r === 'ADMIN' ? 'bg-purple-100 text-purple-900' : r === 'LIBRARIAN' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-800'}`}>{r}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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

            <h1 className="display-title text-6xl sm:text-7xl md:text-8xl lg:text-[5.4rem] text-black">
              Borrow stories <br className="hidden sm:inline" />
              worth talking <br className="hidden sm:inline" />
              about
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
              <a href="#catalog" className="inline-flex items-center gap-2 px-6 py-4 bg-white/90 hover:bg-white text-gray-950 font-extrabold text-sm sm:text-base rounded-full shadow-md transition-all btn-pill">
                <span>Explore Live Catalog</span>
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

            <div className="pt-4 flex flex-wrap items-center gap-6 text-xs sm:text-sm font-bold text-gray-800">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Instant Desk Pickup</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Automated FIFO Waitlists</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-700" />Zero Late Fees on Returns</div>
            </div>
          </div>

          {/* Right 3D book */}
          <div className="lg:col-span-5 relative flex items-center justify-center min-h-[380px] sm:min-h-[460px] perspective-1200 mt-6 lg:mt-0">
            <div className="book-container relative w-64 sm:w-72 h-88 sm:h-96 rounded-r-lg shadow-2xl cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-blue-900 to-indigo-950 rounded-r-lg border-l-4 border-pink-400 p-5 flex flex-col justify-between book-spine-3d overflow-hidden text-white">
                <div className="absolute top-0 left-0 bottom-0 w-12 bg-brandPink border-r border-pink-400 flex flex-col justify-between py-6 items-center">
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                  <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80 rotate-90 select-none">BOOKDROP</span>
                  <div className="w-2 h-2 rounded-full bg-white/60" />
                </div>
                <div className="relative z-10 self-end w-9 h-9 rounded-full bg-pink-400 border border-white/50 flex items-center justify-center shadow-md">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <div className="relative z-10 pl-12 my-auto space-y-2">
                  <span className="text-[9px] uppercase font-mono tracking-widest text-pink-300 font-bold block">EDITION 2026 · K8S SUPERGRAPH</span>
                  <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white drop-shadow">THE COMPLETE CIRCULATION</h3>
                  <div className="w-16 h-1 bg-pink-400 rounded-full" />
                  <p className="text-[10px] text-blue-200 line-clamp-2 pt-1 font-medium">Strict state machine workflows, transactional outbox events, and distributed tracing.</p>
                </div>
                <div className="relative z-10 pl-12 self-start flex items-center gap-2 text-[10px] font-mono text-white/60">
                  <span className="tracking-widest">||| | |||| |||</span>
                  <span>BOOKDROP-001</span>
                </div>
              </div>
              <div className="absolute top-1 right-0 bottom-1 w-6 transform translate-x-full book-pages-edge rounded-r-sm border-r border-gray-300" />
              <div className="absolute bottom-0 left-1 right-1 h-6 transform translate-y-full book-pages-edge border-b border-gray-300" />
            </div>

            <div className="absolute top-1/2 -right-4 sm:-right-8 transform -translate-y-1/2 rotate-[-6deg] z-30 pointer-events-none select-none">
              <div className="font-handwriting text-3xl sm:text-4xl font-bold text-indigo-950 leading-none tracking-wide text-center drop-shadow-sm">
                Borrow up to <br />5 books free &amp; <br />instant pickup!
              </div>
            </div>

            <div className="absolute bottom-2 right-4 sm:-right-4 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/95 border-2 border-white shadow-xl flex items-center justify-center z-30 hover:scale-110 transition-transform cursor-pointer">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-gray-200 flex items-center justify-center bg-yellow-100">
                <span className="text-brandPink font-black text-xl">B</span>
              </div>
            </div>
          </div>
        </main>

        <div className="relative z-20 pb-4 px-6 text-center text-xs font-bold text-gray-800/80 flex items-center justify-center gap-2">
          <span>Enterprise Library Circulation System</span>·<span>Next.js 14 &amp; Apollo GraphQL Supergraph</span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 2 — HOW IT WORKS
          ═══════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-black uppercase tracking-widest text-brandOrange">Effortless Circulation</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">How Bookdrop Works in 3 Simple Steps</h2>
            <p className="text-sm sm:text-base text-slate-600 font-medium">We took everything frustrating about public libraries and automated it with state machine precision and real-time queues.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Browse & Reserve Online', desc: 'Search thousands of titles, see real-time shelf copy availability, and place a hold with one click. If all copies are out, join the automated FIFO waitlist.', bg: 'bg-amber-50/70 border-amber-200/60', accent: 'bg-brandOrange' },
              { num: '2', title: 'Instant Desk Pickup', desc: 'Your physical copy is tagged and held at the circulation desk for 48 hours. Show your patron barcode, the librarian scans it, and your loan is active.', bg: 'bg-teal-50/70 border-teal-200/60', accent: 'bg-brandTeal' },
              { num: '3', title: 'Return & Rotate Waitlists', desc: 'Drop off your book at any returns desk. Once inspected, our event bus automatically notifies and promotes the next patron waiting in line.', bg: 'bg-pink-50/70 border-pink-200/60', accent: 'bg-brandPink' },
            ].map((step) => (
              <div key={step.num} className={`p-8 rounded-3xl ${step.bg} border relative hover:-translate-y-1 transition-transform`}>
                <div className={`w-12 h-12 rounded-2xl ${step.accent} text-white flex items-center justify-center font-black text-lg shadow-md mb-6`}>{step.num}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-medium">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 3 — LIVE CATALOG
          ═══════════════════════════════════════════════════════════════════ */}
      <section id="catalog" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-brandTeal">Live Catalog &amp; Real-Time Availability</span>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 mt-1">Explore the Library Collection</h2>
              <p className="text-sm text-slate-500 font-medium mt-1">
                {isLoading ? 'Searching titles...' : `Showing ${filteredBooks.length} titles available in collection`}
              </p>
            </div>
            <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md w-full">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, ISBN, or author..." className="w-full pl-10 pr-4 py-2.5 rounded-full border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brandOrange shadow-sm" />
              </div>
              <button type="submit" className="px-5 py-2.5 rounded-full bg-brandOrange text-gray-950 font-black text-xs sm:text-sm shadow-sm hover:bg-orange-500 transition-all btn-pill">Search</button>
            </form>
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {categoriesList.map((cat) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-4 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-black text-brandYellow shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>{cat}</button>
            ))}
          </div>

          {/* Action alerts */}
          {actionSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /><span className="font-semibold">{actionSuccess}</span>
            </div>
          )}
          {actionError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" /><span className="font-semibold">{actionError}</span>
            </div>
          )}

          {/* Books grid */}
          {error ? (
            <div className="p-12 rounded-3xl bg-rose-50 border border-rose-200 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
              <h3 className="font-bold text-rose-900">Could not connect to catalog service</h3>
              <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
              <Button variant="outline" size="sm" onClick={() => loadBooks(search)}>Retry Connection</Button>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 rounded-2xl border border-slate-200 bg-white animate-pulse p-6 space-y-4">
                  <div className="h-6 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                  <div className="h-20 bg-slate-50 rounded" />
                </div>
              ))}
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 p-8">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">No books found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {search ? `No titles matched "${search}".` : 'The catalog is currently empty.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map((book) => {
                const hasAvailable = book.availableCopiesCount > 0;
                const hasQueue = book.queueLength > 0;
                return (
                  <Card key={book.id} className="flex flex-col justify-between hover:shadow-lg hover:border-amber-300 transition-all duration-200 bg-white rounded-2xl overflow-hidden group border border-slate-200">
                    <CardHeader className="p-6 pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="text-lg font-bold group-hover:text-brandOrange transition-colors line-clamp-1">{book.title}</CardTitle>
                          <p className="text-xs font-semibold text-slate-500 line-clamp-1">{book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'}</p>
                        </div>
                        {book.publishedYear && <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{book.publishedYear}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {book.categories?.map((cat) => (
                          <span key={cat.id} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{cat.name}</span>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="px-6 py-2 flex-1">
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{book.description || 'No description cataloged for this title.'}</p>
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div>
                          {hasAvailable ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />{book.availableCopiesCount} Available
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />All Copies Borrowed
                            </span>
                          )}
                        </div>
                        {hasQueue && <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1"><Users className="w-3 h-3" />{book.queueLength} in waitlist</span>}
                      </div>
                    </CardContent>
                    <CardFooter className="p-6 pt-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
                      <button onClick={() => setSelectedBook(book)} className="text-xs font-bold text-slate-700 hover:text-black hover:underline underline-offset-2">View Details</button>
                      {hasAvailable ? (
                        <button onClick={() => handleRequestHold(book)} disabled={isActionLoading} className="px-4 py-2 rounded-full bg-black text-brandYellow font-extrabold text-xs shadow-sm hover:bg-gray-800 transition-all btn-pill flex items-center gap-1.5">
                          <BookmarkPlus className="w-3.5 h-3.5" />Request Hold
                        </button>
                      ) : (
                        <button onClick={() => handleJoinQueue(book)} disabled={isActionLoading} className="px-4 py-2 rounded-full bg-brandOrange text-gray-950 font-black text-xs shadow-sm hover:bg-orange-500 transition-all btn-pill flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />Join Waitlist
                        </button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          SECTION 4 — ARCHITECTURE FEATURES
          ═══════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-20 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-2xl mx-auto space-y-3 mb-16">
            <span className="text-xs font-black uppercase tracking-widest text-brandPink">Under The Hood</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">Enterprise Grade Microservices Platform</h2>
            <p className="text-sm text-slate-600 font-medium">Bookdrop combines modern UX with rigorous backend guarantees across Apollo GraphQL Federation, RabbitMQ, and Kubernetes.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: <ShieldCheck className="w-5 h-5" />, bg: 'bg-indigo-600', title: 'Strict State Machines', desc: 'Hold, loan, and fine states are governed by deterministic finite state machines, guaranteeing zero illegal transitions.' },
              { icon: <Cpu className="w-5 h-5" />, bg: 'bg-teal-600', title: 'Apollo Supergraph', desc: 'Identity and Library-Core subgraphs are stitched by a high-speed federated router on a single GraphQL endpoint.' },
              { icon: <Boxes className="w-5 h-5" />, bg: 'bg-amber-500', title: 'RabbitMQ Event Bus', desc: 'Domain side effects like return inspections and queue promotions publish asynchronous events to message queues.' },
              { icon: <RotateCcw className="w-5 h-5" />, bg: 'bg-pink-600', title: 'Distributed Tracing', desc: 'End-to-end W3C traceparents track every client mutation across Gateway, Subgraphs, and Jaeger timelines.' },
            ].map((feat) => (
              <div key={feat.title} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className={`w-10 h-10 rounded-xl ${feat.bg} text-white flex items-center justify-center`}>{feat.icon}</div>
                <h3 className="font-bold text-slate-900 text-base">{feat.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          BOOK DETAIL MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {selectedBook && (
        <Modal isOpen={!!selectedBook} onClose={() => setSelectedBook(null)} title={selectedBook.title}>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>ISBN: {selectedBook.isbn}</span>
              {selectedBook.publishedYear && <span>Published {selectedBook.publishedYear}</span>}
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Authors</h4>
              <p className="text-sm font-semibold text-slate-900">{selectedBook.authors?.map((a) => a.name).join(', ') || 'Unknown'}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Categories</h4>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedBook.categories?.map((cat) => <Badge key={cat.id} variant="default">{cat.name}</Badge>)}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Synopsis</h4>
              <p className="text-xs text-slate-600 leading-relaxed mt-1">{selectedBook.description || 'No description provided for this catalog title.'}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-4 text-center">
              <div>
                <span className="text-xs text-slate-500">Available Copies</span>
                <p className="text-lg font-bold text-emerald-700">{selectedBook.availableCopiesCount} In Stock</p>
              </div>
              <div>
                <span className="text-xs text-slate-500">Waitlist Queue</span>
                <p className="text-lg font-bold text-indigo-700">{selectedBook.queueLength} patrons</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedBook(null)}>Close</Button>
              {selectedBook.availableCopiesCount > 0 ? (
                <Button variant="primary" size="sm" isLoading={isActionLoading} onClick={() => { handleRequestHold(selectedBook); setSelectedBook(null); }}>Request Hold</Button>
              ) : (
                <Button variant="warning" size="sm" isLoading={isActionLoading} onClick={() => { handleJoinQueue(selectedBook); setSelectedBook(null); }}>Join Waitlist</Button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-black/10 bg-brandYellow text-brandDark py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-black/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-black text-brandYellow flex items-center justify-center font-black"><BookOpen className="w-4 h-4" /></div>
              <span className="text-lg font-black tracking-tight uppercase">Bookdrop</span>
              <span className="text-xs font-bold text-gray-800">· Enterprise Library Platform</span>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs font-extrabold text-gray-900">
              <a href="#catalog" className="hover:text-brandPink transition-colors">Catalog</a>
              <Link href="/dashboard" className="hover:text-brandPink transition-colors">Patron Dashboard</Link>
              <Link href="/staff/desk" className="hover:text-brandPink transition-colors">Circulation Desk</Link>
              <Link href="/staff/returns" className="hover:text-brandPink transition-colors">Returns Desk</Link>
              <Link href="/staff/inventory" className="hover:text-brandPink transition-colors">Inventory</Link>
              <Link href="/staff/admin" className="hover:text-brandPink transition-colors">Admin Jobs</Link>
            </div>
          </div>
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs font-bold text-gray-800/80 gap-2">
            <p>© {new Date().getFullYear()} Bookdrop. Built with transactional safety &amp; state machine integrity.</p>
            <p className="flex items-center gap-1">Inspired by Aardvark Design Language <Heart className="w-3.5 h-3.5 text-brandPink fill-current" /></p>
          </div>
        </div>
      </footer>
    </div>
  );
}
