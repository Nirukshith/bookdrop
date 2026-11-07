'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Copy, Book, CopyStatus } from '@/lib/types';
import { fetchGraphQL } from '@/lib/graphql-client';
import {
  COPIES_QUERY,
  BOOKS_QUERY,
  ADD_COPY_MUTATION,
  RETIRE_COPY_MUTATION,
  CREATE_BOOK_MUTATION,
} from '@/lib/graphql-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@/lib/utils';
import {
  Boxes,
  Plus,
  QrCode,
  CheckCircle2,
  AlertCircle,
  Archive,
  RefreshCw,
  BookOpen,
  Filter,
} from 'lucide-react';

export default function StaffInventoryPage() {
  const { isStaff, switchDemoUser } = useAuth();

  const [copies, setCopies] = useState<Copy[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add Copy Modal
  const [isAddCopyOpen, setIsAddCopyOpen] = useState(false);
  const [newCopyBookId, setNewCopyBookId] = useState<string>('');
  const [newCopyBarcode, setNewCopyBarcode] = useState<string>('');
  const [newCopyShelf, setNewCopyShelf] = useState<string>('');
  const [newCopyNotes, setNewCopyNotes] = useState<string>('');
  const [isSubmittingCopy, setIsSubmittingCopy] = useState(false);

  // Add Book Modal
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookIsbn, setBookIsbn] = useState('');
  const [bookYear, setBookYear] = useState('');
  const [bookPrice, setBookPrice] = useState('');
  const [bookDesc, setBookDesc] = useState('');
  const [isSubmittingBook, setIsSubmittingBook] = useState(false);

  // Retiring copy
  const [retiringCopyId, setRetiringCopyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [copiesRes, booksRes] = await Promise.all([
        fetchGraphQL<{ copies: Copy[] }>(COPIES_QUERY, {
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          includeRetired: true,
          take: 50,
        }).catch(() => ({ copies: [] })),
        fetchGraphQL<{ books: Book[] }>(BOOKS_QUERY, { take: 50 }).catch(() => ({ books: [] })),
      ]);

      setCopies(copiesRes.copies || []);
      setBooks(booksRes.books || []);
      if (booksRes.books?.length > 0 && !newCopyBookId) {
        setNewCopyBookId(booksRes.books[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory copies');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, newCopyBookId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCopyBookId) return;

    try {
      setIsSubmittingCopy(true);
      setError(null);
      setActionSuccess(null);

      const res = await fetchGraphQL<{ addCopy: Copy }>(ADD_COPY_MUTATION, {
        input: {
          bookId: parseInt(newCopyBookId, 10),
          barcode: newCopyBarcode.trim() || undefined,
          shelfLocation: newCopyShelf.trim() || undefined,
          notes: newCopyNotes.trim() || undefined,
        },
      });

      setActionSuccess(`Added copy with barcode ${res.addCopy.barcode} to inventory!`);
      setIsAddCopyOpen(false);
      setNewCopyBarcode('');
      setNewCopyShelf('');
      setNewCopyNotes('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to add copy');
    } finally {
      setIsSubmittingCopy(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTitle || !bookIsbn) return;

    try {
      setIsSubmittingBook(true);
      setError(null);
      setActionSuccess(null);

      const res = await fetchGraphQL<{ createBook: Book }>(CREATE_BOOK_MUTATION, {
        input: {
          title: bookTitle.trim(),
          isbn: bookIsbn.trim(),
          publishedYear: bookYear ? parseInt(bookYear, 10) : undefined,
          priceRs: bookPrice ? parseFloat(bookPrice) : undefined,
          description: bookDesc.trim() || undefined,
          authorIds: [],
          categoryIds: [],
        },
      });

      setActionSuccess(`Created book title "${res.createBook.title}"!`);
      setIsAddBookOpen(false);
      setBookTitle('');
      setBookIsbn('');
      setBookYear('');
      setBookPrice('');
      setBookDesc('');
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to create book title');
    } finally {
      setIsSubmittingBook(false);
    }
  };

  const handleRetireCopy = async (copyId: string) => {
    if (!confirm('Are you sure you want to retire this copy from circulation?')) return;
    try {
      setRetiringCopyId(copyId);
      setError(null);
      setActionSuccess(null);

      await fetchGraphQL(RETIRE_COPY_MUTATION, {
        id: parseInt(copyId, 10),
        reason: 'Retired by staff',
      });

      setActionSuccess(`Copy #${copyId} has been retired.`);
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to retire copy');
    } finally {
      setRetiringCopyId(null);
    }
  };

  const getCopyStatusBadge = (status: CopyStatus, retiredAt?: string | null) => {
    if (retiredAt) return <Badge variant="secondary">RETIRED</Badge>;
    switch (status) {
      case 'AVAILABLE':
        return <Badge variant="success">AVAILABLE</Badge>;
      case 'BORROWED':
        return <Badge variant="default">BORROWED</Badge>;
      case 'ON_HOLD':
        return <Badge variant="warning">ON HOLD</Badge>;
      case 'DAMAGED':
        return <Badge variant="danger">DAMAGED</Badge>;
      case 'LOST':
        return <Badge variant="secondary">LOST</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Inventory & Copies
            </h1>
            <Badge variant="warning">Staff Inventory</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage physical copies, barcode tags, shelf locations, and copy lifecycles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddBookOpen(true)}
            className="text-xs gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Add New Title
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddCopyOpen(true)}
            className="text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Copy Barcode
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Status Filter Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-slate-600">Filter Status:</span>
          {['ALL', 'AVAILABLE', 'BORROWED', 'ON_HOLD', 'DAMAGED', 'LOST'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          isLoading={isLoading}
          className="text-xs gap-1"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* Inventory Table */}
      {isLoading ? (
        <div className="py-16 text-center text-xs text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
          Loading inventory copies...
        </div>
      ) : copies.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-6">
          <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-700">No copies found</h3>
          <p className="text-xs text-slate-500 mt-1">
            No copies match the selected filter. Click &quot;Add Copy Barcode&quot; above to register a new copy.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Copy Barcode</th>
                <th className="px-4 py-3">Book Title</th>
                <th className="px-4 py-3">Shelf Location</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {copies.map((copy) => {
                const book = books.find((b) => parseInt(b.id, 10) === copy.bookId);
                return (
                  <tr key={copy.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {copy.barcode}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {book ? book.title : `Book #${copy.bookId}`}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{copy.shelfLocation || '—'}</td>
                    <td className="px-4 py-3">{getCopyStatusBadge(copy.status, copy.retiredAt)}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                      {copy.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(copy.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {!copy.retiredAt && copy.status !== 'BORROWED' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          isLoading={retiringCopyId === copy.id}
                          onClick={() => handleRetireCopy(copy.id)}
                          className="text-xs text-rose-600 hover:bg-rose-50 p-1.5 h-auto"
                          title="Retire Copy"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add Copy Barcode */}
      <Modal
        isOpen={isAddCopyOpen}
        onClose={() => setIsAddCopyOpen(false)}
        title="Add Physical Copy"
        description="Register a physical copy with a barcode tag and shelf location."
      >
        <form onSubmit={handleAddCopy} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Book</label>
            <select
              value={newCopyBookId}
              onChange={(e) => setNewCopyBookId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} (ISBN: {b.isbn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Barcode (Leave empty to auto-generate)
            </label>
            <input
              type="text"
              value={newCopyBarcode}
              onChange={(e) => setNewCopyBarcode(e.target.value)}
              placeholder="e.g. BC-1009"
              className="w-full font-mono px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Shelf Location
            </label>
            <input
              type="text"
              value={newCopyShelf}
              onChange={(e) => setNewCopyShelf(e.target.value)}
              placeholder="e.g. Row 4, Shelf B"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={newCopyNotes}
              onChange={(e) => setNewCopyNotes(e.target.value)}
              placeholder="Condition, donation source, or cataloging note..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddCopyOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingCopy}>
              Register Copy
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Add Book Title */}
      <Modal
        isOpen={isAddBookOpen}
        onClose={() => setIsAddBookOpen(false)}
        title="Add New Book Title"
        description="Catalog a new publication title into Bookdrop."
      >
        <form onSubmit={handleAddBook} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
            <input
              type="text"
              required
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              placeholder="The Pragmatic Programmer"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">ISBN</label>
              <input
                type="text"
                required
                value={bookIsbn}
                onChange={(e) => setBookIsbn(e.target.value)}
                placeholder="978-0201616224"
                className="w-full font-mono px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Published Year
              </label>
              <input
                type="number"
                value={bookYear}
                onChange={(e) => setBookYear(e.target.value)}
                placeholder="2023"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Replacement Price (Rupees)
            </label>
            <input
              type="number"
              step="0.01"
              value={bookPrice}
              onChange={(e) => setBookPrice(e.target.value)}
              placeholder="599.00"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Summary</label>
            <textarea
              rows={3}
              value={bookDesc}
              onChange={(e) => setBookDesc(e.target.value)}
              placeholder="Brief overview or blurb..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAddBookOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingBook}>
              Create Book Title
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

