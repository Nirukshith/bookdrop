import React from 'react';
import { coverFor, coverKey, type ShelfBook } from './shelf-data';

/**
 * A CSS-3D book (front, back, spine, page edges). Size comes from the
 * --bw (width) and --bd (depth) custom properties set on the carousel stage.
 * Covers are generated from the title so every catalog book gets art.
 */
export function Book3D({ book, index }: { book: ShelfBook; index: number }) {
  const { palette, variant } = coverFor(coverKey(book.id, index));
  const author = book.authors[0] ?? 'Unknown author';
  const no = String(index + 1).padStart(3, '0');

  // Longest word drives title size so words like "PUNISHMENT" never overflow the cover.
  const longestWord = Math.max(5, ...book.title.split(/\s+/).map((w) => w.length));

  const style = {
    '--lw': longestWord,
    '--c-bg': palette.bg,
    '--c-fg': palette.fg,
    '--c-accent': palette.accent,
    '--c-spine': palette.spine,
  } as React.CSSProperties;

  return (
    <div className="shelf-book" style={style}>
      <div className="shelf-book__back" />
      <div className="shelf-book__pages" />
      <div className="shelf-book__top" />
      <div className="shelf-book__bottom" />
      <div className="shelf-book__spine">
        <span className="shelf-book__spine-title">{book.title}</span>
        <span className="shelf-book__spine-mark">BD</span>
      </div>
      <div className="shelf-book__front">
        <Cover variant={variant} book={book} author={author} no={no} />
        <div className="shelf-book__hinge" />
        <div className="shelf-book__sheen" />
      </div>
    </div>
  );
}

/**
 * The same generated cover as Book3D, flat (no 3D box). It scales to the
 * width of its container, so size it by giving the wrapper a width.
 */
export function FlatBookCover({ book, index, className = '' }: { book: ShelfBook; index: number; className?: string }) {
  const { palette, variant } = coverFor(coverKey(book.id, index));
  const longestWord = Math.max(5, ...book.title.split(/\s+/).map((w) => w.length));
  const style = {
    '--lw': longestWord,
    '--c-bg': palette.bg,
    '--c-fg': palette.fg,
    '--c-accent': palette.accent,
    '--c-spine': palette.spine,
  } as React.CSSProperties;

  return (
    <div className={`flat-cover ${className}`} style={style} aria-hidden>
      <div className="flat-cover__inner">
        <Cover variant={variant} book={book} author={book.authors[0] ?? 'Unknown author'} no={String(index + 1).padStart(3, '0')} />
        <div className="shelf-book__hinge" />
        <div className="shelf-book__sheen" />
      </div>
    </div>
  );
}

function Cover({ variant, book, author, no }: { variant: number; book: ShelfBook; author: string; no: string }) {
  const year = book.year ?? '';

  switch (variant) {
    // Bold block type
    case 0:
      return (
        <div className="cover cover--block">
          <span className="cover__meta">BOOKDROP · No.{no}</span>
          <h4 className="cover__block-title">{book.title}</h4>
          <div className="cover__row">
            <span>{author}</span>
            <span>{year}</span>
          </div>
        </div>
      );

    // Classic serif with double frame
    case 1:
      return (
        <div className="cover cover--classic">
          <div className="cover__frame">
            <span className="cover__meta">{book.genres[0] ?? 'Fiction'}</span>
            <div className="cover__ornament">✦</div>
            <h4 className="cover__serif-title">{book.title}</h4>
            <div className="cover__rule" />
            <span className="cover__author-caps">{author}</span>
          </div>
        </div>
      );

    // Big circle
    case 2:
      return (
        <div className="cover cover--circle">
          <div className="cover__circle" />
          <span className="cover__meta relative">No.{no}</span>
          <div className="relative mt-auto">
            <h4 className="cover__serif-title cover__serif-title--left">{book.title}</h4>
            <span className="cover__author-caps">{author}</span>
          </div>
        </div>
      );

    // Diagonal stripes + label
    case 3:
      return (
        <div className="cover cover--stripes">
          <div className="cover__stripes" />
          <div className="cover__label">
            <h4 className="cover__label-title">{book.title}</h4>
            <span className="cover__author-caps">{author}</span>
          </div>
          <span className="cover__meta cover__meta--bottom">{year} · BOOKDROP</span>
        </div>
      );

    // Split with giant initial
    default:
      return (
        <div className="cover cover--split">
          <div className="cover__split-top">
            <span className="cover__initial">{book.title.replace(/^(the|a|an)\s+/i, '').charAt(0)}</span>
          </div>
          <div className="cover__split-bottom">
            <h4 className="cover__split-title">{book.title}</h4>
            <div className="cover__row">
              <span>{author}</span>
              <span>{year}</span>
            </div>
          </div>
        </div>
      );
  }
}
