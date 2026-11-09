'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Book } from '@/lib/types';
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
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';

export default function CatalogPage() {
  const { user, isAuthenticated, isMember, switchDemoUser } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected book for modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadBooks = useCallback(async (query: string = '') => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchGraphQL<{ books: Book[] }>(BOOKS_QUERY, {
        search: query.trim() || undefined,
        take: 30,
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
      // Reload catalog to reflect new available copies count
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
      // Reload catalog to reflect updated queue length
      loadBooks(search);
    } catch (err: any) {
      setActionError(err.message || 'Could not join reservation queue.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Search Section */}
      <div className="relative rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white p-8 sm:p-12 overflow-hidden shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_50%)]" />
        <div className="relative max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-indigo-200 border border-white/15">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Live Catalog & Circulation Search
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            Discover books, reserve copies, or join waitlists in seconds.
          </h1>
          <p className="text-indigo-200 text-sm sm:text-base leading-relaxed">
            Real-time availability, instant hold fulfillment at the circulation desk, and automated
            queue management.
          </p>

          <form onSubmit={handleSearchSubmit} className="pt-2 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, ISBN, or author name..."
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-lg"
              />
            </div>
            <Button type="submit" variant="primary" size="lg" className="px-6 rounded-xl shadow-lg">
              Search
            </Button>
          </form>
        </div>
      </div>

      {/* Catalog Header & Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Library Catalog</h2>
          <p className="text-xs text-slate-500">
            {isLoading ? 'Searching titles...' : `Showing ${books.length} titles in collection`}
          </p>
        </div>

        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              loadBooks('');
            }}
            className="text-xs text-indigo-600"
          >
            Clear Search
          </Button>
        )}
      </div>

      {/* Catalog Grid */}
      {error ? (
        <div className="p-8 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <h3 className="font-semibold text-rose-900">Could not connect to catalog service</h3>
          <p className="text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <Button variant="outline" size="sm" onClick={() => loadBooks(search)}>
            Retry Connection
          </Button>
        </div>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse p-6 space-y-4"
            >
              <div className="h-6 bg-slate-200 rounded w-3/4" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
              <div className="h-16 bg-slate-50 rounded" />
              <div className="h-8 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : books.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-700">No books found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {search
              ? `No titles matched "${search}". Try searching for another keyword or author.`
              : 'The catalog is currently empty. Staff can add new titles via the Inventory desk.'}
          </p>
          {search && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setSearch('');
                loadBooks('');
              }}
            >
              Reset Search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {books.map((book) => {
            const hasAvailable = book.availableCopiesCount > 0;
            const hasQueue = book.queueLength > 0;

            return (
              <Card
                key={book.id}
                className="flex flex-col justify-between hover:shadow-md hover:border-indigo-200 transition-all duration-200 group"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {book.title}
                      </CardTitle>
                      <p className="text-xs text-slate-500 line-clamp-1">
                        {book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'}
                      </p>
                    </div>
                    {hasAvailable ? (
                      <Badge variant="success" className="shrink-0">
                        {book.availableCopiesCount} Available
                      </Badge>
                    ) : hasQueue ? (
                      <Badge variant="warning" className="shrink-0">
                        Waitlist ({book.queueLength})
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        Out of Stock
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 flex-1 space-y-3">
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {book.description || 'No summary available for this book.'}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {book.publishedYear || 'N/A'}
                    </span>
                    <span>•</span>
                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">
                      ISBN: {book.isbn}
                    </span>
                    {book.replacementPriceRs && (
                      <>
                        <span>•</span>
                        <span>{formatCurrency(book.replacementPriceRs)}</span>
                      </>
                    )}
                  </div>

                  {/* Categories */}
                  {book.categories && book.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {book.categories.map((c) => (
                        <span
                          key={c.id}
                          className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                        >
                          {c.name}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="p-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedBook(book);
                      setActionSuccess(null);
                      setActionError(null);
                    }}
                    className="text-xs"
                  >
                    Details & Copies
                  </Button>

                  {hasAvailable ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRequestHold(book)}
                      className="text-xs gap-1.5"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      Request Hold
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleJoinQueue(book)}
                      className="text-xs gap-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Join Waitlist
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Book Details & Actions Modal */}
      {selectedBook && (
        <Modal
          isOpen={!!selectedBook}
          onClose={() => setSelectedBook(null)}
          title={selectedBook.title}
          description={`By ${
            selectedBook.authors?.map((a) => a.name).join(', ') || 'Unknown Author'
          }`}
          maxWidth="lg"
        >
          <div className="space-y-6">
            {/* Action Feedback Alerts */}
            {actionSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {actionError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Description */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Overview
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                {selectedBook.description || 'No description provided.'}
              </p>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  ISBN
                </span>
                <span className="font-mono font-medium text-slate-800">{selectedBook.isbn}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Published Year
                </span>
                <span className="font-medium text-slate-800">
                  {selectedBook.publishedYear || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Replacement Price
                </span>
                <span className="font-medium text-slate-800">
                  {formatCurrency(selectedBook.replacementPriceRs)}
                </span>
              </div>
            </div>

            {/* Copy Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Copy Circulation Status
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                  <div className="text-lg font-bold text-emerald-700">
                    {selectedBook.copyCounts?.available ?? selectedBook.availableCopiesCount}
                  </div>
                  <div className="text-[10px] font-medium text-emerald-600">Available</div>
                </div>
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="text-lg font-bold text-amber-700">
                    {selectedBook.copyCounts?.onHold ?? 0}
                  </div>
                  <div className="text-[10px] font-medium text-amber-600">On Hold</div>
                </div>
                <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="text-lg font-bold text-blue-700">
                    {selectedBook.copyCounts?.borrowed ?? 0}
                  </div>
                  <div className="text-[10px] font-medium text-blue-600">Borrowed</div>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-lg font-bold text-slate-700">
                    {selectedBook.copyCounts?.total ?? 0}
                  </div>
                  <div className="text-[10px] font-medium text-slate-600">Total</div>
                </div>
                <div className="p-2 rounded-lg bg-rose-50 border border-rose-100">
                  <div className="text-lg font-bold text-rose-700">
                    {selectedBook.copyCounts?.damaged ?? 0}
                  </div>
                  <div className="text-[10px] font-medium text-rose-600">Damaged</div>
                </div>
                <div className="p-2 rounded-lg bg-purple-50 border border-purple-100">
                  <div className="text-lg font-bold text-purple-700">
                    {selectedBook.queueLength ?? 0}
                  </div>
                  <div className="text-[10px] font-medium text-purple-600">Waitlist</div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {selectedBook.availableCopiesCount > 0 ? (
                  <span className="text-emerald-700 font-medium">
                    ✓ Available for immediate hold reservation
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium">
                    Waitlist queue active: {selectedBook.queueLength} patron(s) waiting
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedBook(null)}
                  className="flex-1 sm:flex-initial"
                >
                  Close
                </Button>

                {selectedBook.availableCopiesCount > 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={isActionLoading}
                    onClick={() => handleRequestHold(selectedBook)}
                    className="flex-1 sm:flex-initial gap-1.5"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    Place Desk Hold
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    isLoading={isActionLoading}
                    onClick={() => handleJoinQueue(selectedBook)}
                    className="flex-1 sm:flex-initial gap-1.5 bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
                  >
                    <Users className="w-4 h-4" />
                    Join Waiting List
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
