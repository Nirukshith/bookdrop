import React from 'react';

/**
 * Bookdrop logo mark: a drop with an open book cut out of its belly.
 * Uses currentColor for the drop, so set the color with a text-* class;
 * `innerColor` fills the book cut-out.
 */
export function BrandMark({ className = 'w-8 h-8', innerColor = '#FBF8EF' }: { className?: string; innerColor?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path
        d="M16 1.5C16 1.5 4.5 13.6 4.5 20.5a11.5 11.5 0 0 0 23 0C27.5 13.6 16 1.5 16 1.5Z"
        fill="currentColor"
      />
      <path
        d="M16 18.2c-1.9-1.3-4.2-1.8-6.7-1.6v7.6c2.5-.2 4.8.3 6.7 1.6 1.9-1.3 4.2-1.8 6.7-1.6v-7.6c-2.5-.2-4.8.3-6.7 1.6Z"
        fill={innerColor}
      />
      <path d="M16 18.2v7.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
