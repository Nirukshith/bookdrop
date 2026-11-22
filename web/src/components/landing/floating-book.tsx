import React from 'react';
import { BookOpen } from 'lucide-react';

/**
 * A plain, closed hardcover rendered as a true CSS 3D box (six faces) that
 * floats over the landing page. Used as decoration to tie the hero, shelf and
 * how-it-works sections together; purely presentational (aria-hidden).
 *
 * Position it with `className` (absolute + top/left/right/bottom utilities).
 */
type FloatingBookProps = {
  /** Main cover colour. */
  cover: string;
  /** Colour of the cloth band along the spine edge of the front cover. */
  band?: string;
  /** Spine (side face) colour; defaults to a darkened cover. */
  spine?: string;
  /** Cover width, any CSS length (e.g. 'clamp(160px, 22vw, 320px)'). */
  width: string;
  /** Rotation in degrees: X/Y tilt the book in 3D, Z spins it flat. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** Show the small round Bookdrop emblem on the cover. */
  emblem?: boolean;
  /** Seconds to offset the idle float animation, so books drift out of sync. */
  delay?: number;
  className?: string;
};

export default function FloatingBook({
  cover,
  band,
  spine,
  width,
  rx = 14,
  ry = -28,
  rz = -24,
  emblem = false,
  delay = 0,
  className = '',
}: FloatingBookProps) {
  const style = {
    '--w': width,
    '--cover': cover,
    '--band': band ?? cover,
    '--spine': spine ?? `color-mix(in srgb, ${cover} 72%, black)`,
    '--rx': `${rx}deg`,
    '--ry': `${ry}deg`,
    '--rz': `${rz}deg`,
    '--delay': `${delay}s`,
  } as React.CSSProperties;

  return (
    <div className={`fbook-wrap pointer-events-none select-none ${className}`} style={style} aria-hidden>
      <div className="fbook-float">
        <div className="fbook">
          <div className="fbook__face fbook__front">
            {emblem && (
              <span className="fbook__emblem">
                <BookOpen className="w-1/2 h-1/2" strokeWidth={2.5} />
              </span>
            )}
          </div>
          <div className="fbook__face fbook__back" />
          <div className="fbook__face fbook__spine" />
          <div className="fbook__face fbook__pages fbook__pages--fore" />
          <div className="fbook__face fbook__pages fbook__pages--top" />
          <div className="fbook__face fbook__pages fbook__pages--bottom" />
        </div>
      </div>
    </div>
  );
}
