import type { Book } from '@/lib/types';

/** A book as the landing-page shelf needs it (works for live API books and the sample shelf). */
export interface ShelfBook {
  id: string;
  title: string;
  authors: string[];
  year?: number | null;
  genres: string[];
  jacket: string;
  available: number;
  queue: number;
  live: boolean;
}

export interface CoverPalette {
  bg: string;
  fg: string;
  accent: string;
  spine: string;
}

/** Brand-aligned cover palettes (pink / teal / orange / yellow + ink & paper). */
export const COVER_PALETTES: CoverPalette[] = [
  { bg: '#E82B8A', fg: '#FFF6E0', accent: '#FCD44D', spine: '#B81E6C' },
  { bg: '#1E2A78', fg: '#F3EEDF', accent: '#E82B8A', spine: '#141C55' },
  { bg: '#00A3AD', fg: '#0D0D0D', accent: '#FCD44D', spine: '#007C84' },
  { bg: '#111111', fg: '#F3EEDF', accent: '#FF9129', spine: '#000000' },
  { bg: '#F3EEDF', fg: '#111111', accent: '#C8102E', spine: '#D9D1BA' },
  { bg: '#FF9129', fg: '#111111', accent: '#1E2A78', spine: '#D9711A' },
  { bg: '#1F6F4A', fg: '#F3EEDF', accent: '#FCD44D', spine: '#165237' },
  { bg: '#FCD44D', fg: '#111111', accent: '#E82B8A', spine: '#E0B52A' },
];

export const COVER_VARIANTS = 5;

/** Small deterministic string hash (FNV-1a) so a title always gets the same cover. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Cover art key for a book: its numeric catalog id when it has one, so the same
 * title gets the same cover on the landing shelf, catalog and dashboard; the
 * list position otherwise (sample shelf).
 */
export function coverKey(id: string | number, fallback: number): number {
  const n = Number(id);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function coverFor(index: number): { palette: CoverPalette; variant: number } {
  return {
    // 3 is coprime with 8, so neighbouring books never share a palette.
    palette: COVER_PALETTES[(index * 3) % COVER_PALETTES.length],
    // Layouts rotate in order, so neighbours never share a cover style.
    variant: index % COVER_VARIANTS,
  };
}

function firstSentence(text: string, max = 96): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const match = clean.match(/^.*?[.!?](\s|$)/);
  const sentence = (match ? match[0] : clean).trim();
  if (sentence.length <= max) return sentence.replace(/[.!?]$/, '');
  return sentence.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

export function fromApiBook(b: Book): ShelfBook {
  return {
    id: String(b.id),
    title: b.title,
    authors: (b.authors ?? []).map((a) => a.name),
    year: b.publishedYear ?? null,
    genres: (b.categories ?? []).map((c) => c.name),
    jacket: b.description ? firstSentence(b.description) : 'A new arrival waiting on the shelf',
    available: b.availableCopiesCount ?? b.availableCopies ?? 0,
    queue: b.queueLength ?? 0,
    live: true,
  };
}

/** Shown when the catalog API is unreachable or has too few titles. Public-domain classics. */
export const SAMPLE_SHELF: ShelfBook[] = [
  { id: 's1', title: 'Pride and Prejudice', authors: ['Jane Austen'], year: 1813, genres: ['Romance', 'Classic'], jacket: 'First impressions are a terrible way to judge a man', available: 3, queue: 0, live: false },
  { id: 's2', title: 'Frankenstein', authors: ['Mary Shelley'], year: 1818, genres: ['Gothic', 'Science Fiction'], jacket: 'A creator, a creature, and no one willing to take the blame', available: 1, queue: 0, live: false },
  { id: 's3', title: 'Moby-Dick', authors: ['Herman Melville'], year: 1851, genres: ['Adventure'], jacket: 'One whale, one captain, one very long grudge', available: 0, queue: 2, live: false },
  { id: 's4', title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], year: 1925, genres: ['Literary Fiction'], jacket: 'The parties were for one person, and she never came', available: 2, queue: 0, live: false },
  { id: 's5', title: 'Dracula', authors: ['Bram Stoker'], year: 1897, genres: ['Horror', 'Gothic'], jacket: 'Told in letters, diaries, and things best left unopened', available: 4, queue: 0, live: false },
  { id: 's6', title: 'The Picture of Dorian Gray', authors: ['Oscar Wilde'], year: 1890, genres: ['Philosophical Fiction'], jacket: 'Stay young forever and let the painting keep the receipts', available: 0, queue: 1, live: false },
  { id: 's7', title: 'Jane Eyre', authors: ['Charlotte Brontë'], year: 1847, genres: ['Romance', 'Gothic'], jacket: 'An orphan, a governess, and a locked room upstairs', available: 2, queue: 0, live: false },
  { id: 's8', title: 'The Count of Monte Cristo', authors: ['Alexandre Dumas'], year: 1844, genres: ['Adventure'], jacket: 'Fourteen years in prison makes for very patient revenge', available: 1, queue: 0, live: false },
  { id: 's9', title: 'Crime and Punishment', authors: ['Fyodor Dostoevsky'], year: 1866, genres: ['Psychological Fiction'], jacket: 'The crime takes a chapter, the conscience takes the rest', available: 0, queue: 3, live: false },
  { id: 's10', title: 'The Time Machine', authors: ['H. G. Wells'], year: 1895, genres: ['Science Fiction'], jacket: 'A dinner-party story about the year 802,701', available: 5, queue: 0, live: false },
];

export function availabilityLabel(b: ShelfBook): string {
  if (b.available > 0) return `${b.available} ${b.available === 1 ? 'copy' : 'copies'} on the shelf`;
  if (b.queue > 0) return `Waitlist · ${b.queue} ahead`;
  return 'All copies out';
}
