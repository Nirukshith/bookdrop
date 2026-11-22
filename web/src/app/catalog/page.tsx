'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Book } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  BOOKS_QUERY,
  REQUEST_HOLD_MUTATION,
  JOIN_QUEUE_MUTATION,
} from '@/lib/graphql-queries';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm-modal';
import { describeCirculationError, type CirculationNotice } from '@/lib/circulation-errors';
import { MAX_ACTIVE_HOLDS, MAX_ACTIVE_LOANS, MAX_ACTIVE_RESERVATIONS, PICKUP_HOLD_HOURS } from '@/lib/library-rules';

import { FlatBookCover } from '@/components/landing/book-3d';
import { fromApiBook } from '@/components/landing/shelf-data';
import {
  Search,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Users,
  BookmarkPlus,
  ArrowRight,
  Loader2,
  X,
  Clock,
  ShieldAlert,
  BookmarkCheck,
} from 'lucide-react';

/** The member's own holds, loans and waitlist entries: drives per-book buttons and limit warnings. */
const MY_SHELF_QUERY = `
  query MyShelf {
    myHolds(status: ACTIVE) { bookId }
    myLoans(status: ACTIVE) { id bookId }
    myReservations { bookId status position }
  }
`;

type MyBookState = { kind: 'hold' } | { kind: 'loan' } | { kind: 'queue'; position: number | null };
interface MyShelf {
  byBook: Record<string, MyBookState>;
  holds: number;
  loans: number;
  waiting: number;
}
const EMPTY_SHELF: MyShelf = { byBook: {}, holds: 0, loans: 0, waiting: 0 };

/** Replaces Request hold / Join waitlist when the member already has this book in some form. */
function MyBookLink({ state, className = '' }: { state: MyBookState; className?: string }) {
  const { href, icon: Icon, label } =
    state.kind === 'hold'
      ? { href: '/dashboard?tab=holds', icon: BookmarkCheck, label: 'On hold' }
      : state.kind === 'loan'
        ? { href: '/dashboard?tab=loans', icon: BookOpen, label: 'Borrowing' }
        : {
            href: '/dashboard?tab=queue',
            icon: Users,
            label: state.position ? `On waitlist · #${state.position}` : 'On waitlist',
          };
  return (
    <Link
      href={href}
      title="View in your dashboard"
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${className}`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const { isAuthenticated, canBorrow, membershipStatus } = useAuth();
  // Logged-in members whose membership has not been approved yet (or was rejected).
  const awaitingApproval = isAuthenticated && !canBorrow;
  const { confirm, notify, confirmDialog } = useConfirm();

  /** Shows a blocked action in the warning modal (visible wherever the user has scrolled). */
  const showNotice = async (notice: Omit<CirculationNotice, 'code'>) => {
    const go = await confirm({
      title: notice.title,
      message: notice.message,
      tone: notice.tone,
      ...(notice.dashboardTab
        ? { confirmText: notice.actionLabel ?? 'Open dashboard', cancelText: 'Close' }
        : { confirmText: 'Got it', hideCancel: true }),
    });
    if (go !== null && notice.dashboardTab) {
      router.push(`/dashboard?tab=${notice.dashboardTab}`);
    }
  };

  const [myShelf, setMyShelf] = useState<MyShelf>(EMPTY_SHELF);

  /** Loads the member's holds/loans/waitlists. Returns null if it couldn't be loaded. */
  const loadMyShelf = useCallback(async (): Promise<MyShelf | null> => {
    if (!isAuthenticated) {
      setMyShelf(EMPTY_SHELF);
      return EMPTY_SHELF;
    }
    try {
      const data = await fetchGraphQL<{
        myHolds: { bookId: number }[];
        myLoans: { id: string; bookId: number }[];
        myReservations: { bookId: number; status: string; position: number | null }[];
      }>(MY_SHELF_QUERY);
      const byBook: Record<string, MyBookState> = {};
      const waiting = data.myReservations.filter((r) => r.status === 'WAITING');
      waiting.forEach((r) => (byBook[String(r.bookId)] = { kind: 'queue', position: r.position }));
      data.myLoans.forEach((l) => (byBook[String(l.bookId)] = { kind: 'loan' }));
      data.myHolds.forEach((h) => (byBook[String(h.bookId)] = { kind: 'hold' }));
      const shelf = { byBook, holds: data.myHolds.length, loans: data.myLoans.length, waiting: waiting.length };
      setMyShelf(shelf);
      return shelf;
    } catch {
      return null;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadMyShelf();
  }, [loadMyShelf]);

  /** Early warning for limits from fresh counts; the API enforces them regardless. */
  const checkLimits = async (action: 'hold' | 'queue') => {
    const shelf = await loadMyShelf();
    if (!shelf) return null; // Couldn't check: let the API decide.
    if (action === 'hold' && shelf.holds >= MAX_ACTIVE_HOLDS) return 'HOLD_LIMIT_REACHED';
    if (action === 'hold' && shelf.loans >= MAX_ACTIVE_LOANS) return 'LOAN_LIMIT_REACHED';
    if (action === 'queue' && shelf.waiting >= MAX_ACTIVE_RESERVATIONS) return 'QUEUE_LIMIT_REACHED';
    return null;
  };

  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected book for details modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

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
    // Support deep links like /catalog?search=Dracula (used by the landing-page shelf).
    const initial = new URLSearchParams(window.location.search).get('search') ?? '';
    if (initial) setSearch(initial);
    loadBooks(initial);
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

  // Cover art follows the book's position in the full list, matching the landing shelf.
  const coverIndex = useMemo(() => new Map(books.map((b, i) => [b.id, i])), [books]);

  const stats = useMemo(
    () => ({
      titles: books.length,
      onShelf: books.filter((b) => b.availableCopiesCount > 0).length,
      genres: Math.max(0, categoriesList.length - 1),
    }),
    [books, categoriesList],
  );

  const handleRequestHold = async (book: Book) => {
    if (!isAuthenticated) {
      router.push('/register');
      return;
    }
    if (!canBorrow) return;
    const limit = await checkLimits('hold');
    if (limit) {
      await showNotice(describeCirculationError({ errors: [{ extensions: { code: limit } }] }, ''));
      return;
    }
    const ok = await confirm({
      title: 'Place a hold?',
      message: (
        <>
          We&apos;ll reserve a copy of <span className="font-semibold text-black/80">{book.title}</span> at the
          pickup desk. Collect it within {PICKUP_HOLD_HOURS} hours or the hold expires.
        </>
      ),
      tone: 'question',
      icon: BookmarkPlus,
      confirmText: 'Place hold',
    });
    if (ok === null) return;
    try {
      setIsActionLoading(true);
      const res = await fetchGraphQL<{
        requestHold: { id: string; copyBarcode?: string; expiresAt: string };
      }>(REQUEST_HOLD_MUTATION, { bookId: parseInt(book.id, 10) });
      const expires = new Date(res.requestHold.expiresAt).toLocaleString();
      loadBooks(search);
      loadMyShelf();
      await notify({
        title: 'Hold placed',
        message: (
          <>
            A copy of <span className="font-semibold text-black/80">{book.title}</span>
            {res.requestHold.copyBarcode ? <> (<span className="font-mono">{res.requestHold.copyBarcode}</span>)</> : null}{' '}
            is waiting for you at the pickup desk until <span className="font-semibold text-black/80">{expires}</span>.
          </>
        ),
      });
    } catch (err: any) {
      await showNotice(describeCirculationError(err, 'Couldn’t place the hold'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleJoinQueue = async (book: Book) => {
    if (!isAuthenticated) {
      router.push('/register');
      return;
    }
    if (!canBorrow) return;
    const limit = await checkLimits('queue');
    if (limit) {
      await showNotice(describeCirculationError({ errors: [{ extensions: { code: limit } }] }, ''));
      return;
    }
    const ok = await confirm({
      title: 'Join the waitlist?',
      message: (
        <>
          All copies of <span className="font-semibold text-black/80">{book.title}</span> are out
          {book.queueLength > 0 ? <>, and {book.queueLength} {book.queueLength === 1 ? 'reader is' : 'readers are'} ahead of you</> : null}.
          We&apos;ll hold a copy for you and email you when it&apos;s your turn.
        </>
      ),
      tone: 'question',
      icon: Users,
      confirmText: 'Join waitlist',
    });
    if (ok === null) return;
    try {
      setIsActionLoading(true);
      const res = await fetchGraphQL<{
        joinReservationQueue: { id: string; position: number };
      }>(JOIN_QUEUE_MUTATION, { bookId: parseInt(book.id, 10) });
      loadBooks(search);
      loadMyShelf();
      await notify({
        title: 'You’re on the waitlist',
        message: (
          <>
            You&apos;re <span className="font-semibold text-black/80">#{res.joinReservationQueue.position}</span> in line for{' '}
            <span className="font-semibold text-black/80">{book.title}</span>. We&apos;ll email you when a copy is ready for pickup.
          </>
        ),
      });
    } catch (err: any) {
      await showNotice(describeCirculationError(err, 'Couldn’t join the waitlist'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const authorsOf = (book: Book) => book.authors?.map((a) => a.name).join(', ') || 'Unknown author';

  return (
    <div className="font-body text-brandDark space-y-8 pb-8">
      {/* Warm paper backdrop for the whole page */}
      <div className="fixed inset-0 -z-10 bg-[#FBF8EF]" aria-hidden />
      {confirmDialog}

      {/* ── Header panel ── */}
      <section className="catalog-hero relative overflow-hidden rounded-[28px] border border-black/[0.06] px-6 py-8 sm:px-10 sm:py-10">
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 border border-black/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black/70">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              Live catalog
            </span>
            <h1 className="font-heading text-[clamp(2.4rem,6vw,4.25rem)] leading-[0.95] tracking-[-0.01em] mt-4">
              Explore the collection
            </h1>
            <p className="mt-3 text-[15px] sm:text-base text-black/70 leading-relaxed">
              Real-time availability for every title on our shelves. Place a hold on an available copy,
              or join the waitlist and we&apos;ll notify you when it&apos;s your turn.
            </p>
          </div>

          <div className="w-full lg:max-w-md space-y-4">
            <form onSubmit={handleSearchSubmit} role="search" className="flex items-center gap-2 rounded-full bg-white border border-black/10 p-1.5 pl-4 shadow-sm focus-within:ring-2 focus-within:ring-black/80">
              <Search className="w-4 h-4 text-black/40 shrink-0" />
              <label htmlFor="catalog-search" className="sr-only">Search the catalog</label>
              <input
                id="catalog-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, author or ISBN"
                className="flex-1 min-w-0 bg-transparent py-2 text-sm text-brandDark placeholder:text-black/40 focus:outline-none"
              />
              <button type="submit" className="shrink-0 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-black/85 transition-colors">
                Search
              </button>
            </form>

            <dl className="grid grid-cols-3 divide-x divide-black/10 rounded-2xl bg-white/60 border border-black/[0.06]">
              {[
                { label: 'Titles', value: stats.titles },
                { label: 'On the shelf', value: stats.onShelf },
                { label: 'Genres', value: stats.genres },
              ].map((s) => (
                <div key={s.label} className="px-4 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-black/55">{s.label}</dt>
                  <dd className="font-heading text-2xl leading-none mt-1.5 tabular-nums">{isLoading ? '–' : s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Genre filter + result count ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="catalog-chips min-w-0 flex-1 flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filter by genre">
          {categoriesList.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-black text-white'
                    : 'bg-white text-black/70 border border-black/10 hover:border-black/30 hover:text-black'
                }`}
              >
                {cat === 'All' ? 'All genres' : cat}
              </button>
            );
          })}
        </div>
        <p className="shrink-0 text-sm text-black/55 sm:pl-2" aria-live="polite">
          {isLoading ? 'Searching…' : `${filteredBooks.length} ${filteredBooks.length === 1 ? 'title' : 'titles'}`}
        </p>
      </div>

      {/* ── Membership not yet approved ── */}
      {awaitingApproval && (
        <div role="status" className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${membershipStatus === 'REJECTED' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {membershipStatus === 'REJECTED' ? (
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-px" />
          ) : (
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-px" />
          )}
          <span className="flex-1">
            {membershipStatus === 'REJECTED' ? (
              <>Your membership application was not approved, so holds and waitlists are unavailable. Please contact the library.</>
            ) : (
              <>
                <span className="font-semibold">Your membership is awaiting approval.</span> You can browse the
                collection now; holds and waitlists unlock once an admin verifies your membership number.{' '}
                <Link href="/dashboard" className="font-semibold underline underline-offset-2">View status</Link>
              </>
            )}
          </span>
        </div>
      )}

      {/* ── Results ── */}
      {error ? (
        <div className="rounded-3xl border border-rose-200 bg-white p-12 text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-rose-600 mx-auto" />
          <h3 className="text-lg font-semibold">We couldn&apos;t reach the catalog</h3>
          <p className="text-sm text-black/60 max-w-md mx-auto">{error}</p>
          <button onClick={() => loadBooks(search)} className="rounded-full border border-black/15 bg-white px-5 py-2 text-sm font-semibold hover:border-black/40 transition-colors">
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden animate-pulse">
              <div className="h-60 bg-[#F4EFDF]" />
              <div className="p-5 space-y-3">
                <div className="h-3 bg-black/[0.06] rounded w-1/3" />
                <div className="h-5 bg-black/[0.08] rounded w-3/4" />
                <div className="h-3 bg-black/[0.06] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="rounded-3xl border border-black/[0.07] bg-white py-16 px-8 text-center">
          <BookOpen className="w-10 h-10 text-black/25 mx-auto mb-3" />
          <h3 className="text-lg font-semibold">No titles found</h3>
          <p className="text-sm text-black/55 mt-1 max-w-sm mx-auto">
            {search ? `Nothing matched “${search}”. Try a different title, author or ISBN.` : 'The catalog is currently empty.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBooks.map((book) => {
            const hasAvailable = book.availableCopiesCount > 0;
            const hasQueue = book.queueLength > 0;
            const genres = book.categories?.map((c) => c.name) ?? [];
            return (
              <article key={book.id} className="catalog-card group flex flex-col rounded-2xl border border-black/[0.08] bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSelectedBook(book)}
                  className="relative flex justify-center bg-[#F4EFDF] px-6 pt-8 pb-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                  aria-label={`View details for ${book.title}`}
                >
                  <FlatBookCover book={fromApiBook(book)} index={coverIndex.get(book.id) ?? 0} className="w-[46%] max-w-[150px]" />
                  {book.publishedYear && (
                    <span className="absolute top-3 right-3 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-black/60">
                      {book.publishedYear}
                    </span>
                  )}
                </button>

                <div className="flex flex-1 flex-col p-5">
                  {genres.length > 0 && (
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50 line-clamp-1">
                      {genres.slice(0, 2).join(' · ')}
                    </p>
                  )}
                  <h2 className="mt-1.5 text-lg font-bold leading-snug line-clamp-2">
                    <button type="button" onClick={() => setSelectedBook(book)} className="text-left hover:underline underline-offset-4 decoration-2 decoration-brandYellowWarm">
                      {book.title}
                    </button>
                  </h2>
                  <p className="mt-0.5 text-sm text-black/60 line-clamp-1">{authorsOf(book)}</p>

                  <div className="mt-4 flex items-center gap-3 text-[13px]">
                    {hasAvailable ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {book.availableCopiesCount} {book.availableCopiesCount === 1 ? 'copy' : 'copies'} available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-medium text-amber-800">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        All copies out
                      </span>
                    )}
                    {hasQueue && (
                      <span className="inline-flex items-center gap-1 text-black/50">
                        <Users className="w-3.5 h-3.5" />{book.queueLength} waiting
                      </span>
                    )}
                  </div>

                  <div className="mt-auto pt-5">
                    {awaitingApproval ? (
                      <button
                        disabled
                        title="Available once your membership is approved"
                        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-black/45 cursor-not-allowed"
                      >
                        <Clock className="w-4 h-4" />Awaiting approval
                      </button>
                    ) : myShelf.byBook[book.id] ? (
                      <MyBookLink state={myShelf.byBook[book.id]} className="w-full" />
                    ) : hasAvailable ? (
                      <button
                        onClick={() => handleRequestHold(book)}
                        disabled={isActionLoading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brandYellow px-4 py-2.5 text-sm font-semibold text-black hover:bg-brandYellowWarm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-50 transition-colors"
                      >
                        <BookmarkPlus className="w-4 h-4" />Request hold
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinQueue(book)}
                        disabled={isActionLoading}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm font-semibold hover:border-black/40 disabled:opacity-50 transition-colors"
                      >
                        <Users className="w-4 h-4" />Join waitlist
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── Book detail ── */}
      {selectedBook && (
        <Modal isOpen={!!selectedBook} onClose={() => setSelectedBook(null)} title={selectedBook.title} description={authorsOf(selectedBook)} maxWidth="2xl">
          <div className="font-body text-brandDark grid gap-6 sm:grid-cols-[160px_1fr]">
            <div className="mx-auto w-36 sm:w-full">
              <FlatBookCover book={fromApiBook(selectedBook)} index={coverIndex.get(selectedBook.id) ?? 0} />
            </div>

            <div className="space-y-5">
              <dl className="divide-y divide-black/10 border-y border-black/10 text-sm">
                {[
                  ['Published', selectedBook.publishedYear ? String(selectedBook.publishedYear) : '—'],
                  ['ISBN', selectedBook.isbn || '—'],
                  ['Genres', selectedBook.categories?.map((c) => c.name).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>

              <p className="text-sm text-black/70 leading-relaxed">
                {selectedBook.description || 'No synopsis has been cataloged for this title yet.'}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#F4EFDF] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">Available</p>
                  <p className="font-heading text-2xl mt-1 tabular-nums">{selectedBook.availableCopiesCount}</p>
                </div>
                <div className="rounded-xl bg-[#F4EFDF] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/50">On waitlist</p>
                  <p className="font-heading text-2xl mt-1 tabular-nums">{selectedBook.queueLength}</p>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <button onClick={() => setSelectedBook(null)} className="rounded-full border border-black/15 px-5 py-2.5 text-sm font-semibold hover:border-black/40 transition-colors">
                  Close
                </button>
                {awaitingApproval ? (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-black/[0.03] px-5 py-2.5 text-sm font-semibold text-black/45 cursor-not-allowed"
                  >
                    <Clock className="w-4 h-4" />
                    Awaiting membership approval
                  </button>
                ) : myShelf.byBook[selectedBook.id] ? (
                  <MyBookLink state={myShelf.byBook[selectedBook.id]} />
                ) : selectedBook.availableCopiesCount > 0 ? (
                  <button
                    disabled={isActionLoading}
                    onClick={() => { handleRequestHold(selectedBook); setSelectedBook(null); }}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50 transition-colors"
                  >
                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                    Request hold
                  </button>
                ) : (
                  <button
                    disabled={isActionLoading}
                    onClick={() => { handleJoinQueue(selectedBook); setSelectedBook(null); }}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-black/85 disabled:opacity-50 transition-colors"
                  >
                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                    Join waitlist
                  </button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
