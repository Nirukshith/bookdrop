'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TransitionLink } from '@/components/page-transition';
import { ArrowRight, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchGraphQL } from '@/lib/graphql-client';
import { BOOKS_QUERY } from '@/lib/graphql-queries';
import type { Book } from '@/lib/types';
import LandingHeader from '@/components/landing/landing-header';
import SiteFooter from '@/components/landing/site-footer';
import { FlatBookCover } from '@/components/landing/book-3d';
import { availabilityLabel, fromApiBook, type ShelfBook } from '@/components/landing/shelf-data';

type Availability = 'all' | 'available' | 'waitlist';

/**
 * Public live catalog: the whole shelf, in the landing page's look, readable
 * without signing in. Borrowing itself happens in the member portal (/catalog).
 */
export default function LiveCatalogPage() {
  const { isAuthenticated } = useAuth();
  const [books, setBooks] = useState<ShelfBook[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>('all');

  const load = useCallback(async () => {
    setError(false);
    setBooks(null);
    try {
      const data = await fetchGraphQL<{ books: Book[] }>(BOOKS_QUERY, { take: 500 }, { skipAuth: true });
      setBooks(data.books.map(fromApiBook));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    books?.forEach((b) => b.genres.forEach((g) => counts.set(g, (counts.get(g) ?? 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([g]) => g);
  }, [books]);

  const visible = useMemo(() => {
    if (!books) return [];
    const q = query.trim().toLowerCase();
    return books.filter((b) => {
      if (genre && !b.genres.includes(genre)) return false;
      if (availability === 'available' && b.available === 0) return false;
      if (availability === 'waitlist' && b.available > 0) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        b.genres.some((g) => g.toLowerCase().includes(q))
      );
    });
  }, [books, query, genre, availability]);

  const onShelf = books?.filter((b) => b.available > 0).length ?? 0;
  const filtered = Boolean(query || genre || availability !== 'all');
  const clearFilters = () => {
    setQuery('');
    setGenre(null);
    setAvailability('all');
  };

  return (
    <div className="w-full overflow-x-clip bg-brandGreen text-brandDark font-body landing-type selection:bg-brandForest selection:text-white">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-x-clip">
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 1440 600"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M-100 380 C300 300,560 560,900 450 C1200 360,1400 520,1600 470 L1600 700 L-100 700Z" fill="#A9DE8E" />
          <path d="M-100 220 C260 120,480 420,820 320 C1120 230,1340 380,1600 280 L1600 700 L-100 700Z" fill="#DDF5CC" opacity="0.6" />
        </svg>

        <LandingHeader />

        <div className="relative z-20 px-6 lg:px-16 pt-8 pb-14 max-w-7xl mx-auto w-full">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-black/5 border border-black/10 text-xs font-bold text-gray-900">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {books ? `${books.length} titles · ${onShelf} on the shelf right now` : 'Live from the circulation desk'}
          </div>
          <h1 className="display-title mt-5 text-[clamp(2.4rem,8vw,4.8rem)] text-black">The live catalog</h1>
          <p className="mt-4 max-w-xl text-base sm:text-lg font-semibold text-gray-900 leading-snug">
            Every book in the library, with availability updated as copies come and go. Find something you like, then sign in to
            put it on hold.
          </p>

          {/* Search */}
          <label className="mt-8 flex max-w-2xl items-center gap-3 rounded-full bg-white px-5 py-3.5 shadow-md focus-within:ring-2 focus-within:ring-black">
            <Search className="w-5 h-5 shrink-0 text-gray-500" />
            <span className="sr-only">Search the catalog</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author or genre"
              className="w-full bg-transparent text-base font-semibold text-gray-950 placeholder:text-gray-400 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-gray-500 hover:text-black">
                <X className="w-4 h-4" />
              </button>
            )}
          </label>
        </div>
      </section>

      {/* ── Filters + grid ───────────────────────────────────────────────── */}
      <section className="relative bg-[#FBF8EF] rounded-t-[2.5rem] px-6 lg:px-16 pt-10 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">Genre</span>
                <select
                  value={genre ?? ''}
                  onChange={(e) => setGenre(e.target.value || null)}
                  className="pill-select w-full sm:w-64 rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-extrabold text-gray-900 hover:border-black focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="">All genres</option>
                  {genres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-600">Availability</span>
                <select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value as Availability)}
                  className="pill-select w-full sm:w-56 rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-extrabold text-gray-900 hover:border-black focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="all">Everything</option>
                  <option value="available">On the shelf</option>
                  <option value="waitlist">Waitlist only</option>
                </select>
              </label>
            </div>
            {filtered && (
              <button type="button" onClick={clearFilters} className="self-start lg:self-end text-sm font-black text-gray-900 underline decoration-2 underline-offset-4 decoration-brandForest hover:decoration-black">
                Clear filters
              </button>
            )}
          </div>

          {error ? (
            <EmptyState
              title="We couldn't reach the catalog"
              body="The library server didn't answer. Check that it's running, then try again."
              action={
                <button type="button" onClick={load} className="btn-pill inline-flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-black text-white">
                  <RefreshCw className="w-4 h-4" /> Try again
                </button>
              }
            />
          ) : !books ? (
            <div className="flex items-center justify-center gap-3 py-32 text-sm font-bold text-gray-600">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading the shelf…
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              title="Nothing matches that"
              body="Try a different search or loosen the filters."
              action={
                filtered ? (
                  <button type="button" onClick={clearFilters} className="btn-pill rounded-full bg-black px-6 py-3 text-sm font-black text-white">
                    Clear filters
                  </button>
                ) : null
              }
            />
          ) : (
            <>
              <p className="mt-8 text-sm font-bold text-gray-600">
                Showing {visible.length} of {books.length} {books.length === 1 ? 'title' : 'titles'}
              </p>
              <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-12">
                {visible.map((book) => (
                  <li key={book.id} className="catalog-card flex min-w-0 flex-col">
                    <FlatBookCover book={book} index={books.indexOf(book)} className="w-full" />
                    <h2 className="book-name mt-4 text-base leading-tight text-gray-950">{book.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-gray-600 [overflow-wrap:anywhere]">{book.authors.join(', ') || 'Unknown author'}</p>
                    <span
                      className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                        book.available > 0
                          ? 'bg-emerald-100 text-emerald-900'
                          : book.queue > 0
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          book.available > 0 ? 'bg-emerald-600' : book.queue > 0 ? 'bg-amber-600' : 'bg-gray-500'
                        }`}
                      />
                      {availabilityLabel(book)}
                    </span>
                    <TransitionLink
                      href={isAuthenticated ? '/catalog' : '/login'}
                      className="group mt-3 inline-flex w-fit items-center gap-1.5 text-sm font-black text-gray-950 underline decoration-2 underline-offset-4 decoration-brandForest hover:decoration-black"
                    >
                      {isAuthenticated
                        ? book.available > 0
                          ? 'Place a hold'
                          : 'Join the waitlist'
                        : 'Sign in to borrow'}
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </TransitionLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-28">
      <p className="text-xl font-black text-gray-950 [font-family:var(--font-body)]">{title}</p>
      <p className="mt-2 max-w-sm text-sm font-semibold text-gray-600">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
