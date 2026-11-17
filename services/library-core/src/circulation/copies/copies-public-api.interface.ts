import { CopyStatus } from '@prisma/client';

export interface CopyPublicObject {
  id: number;
  bookId: number;
  barcode: string;
  status: CopyStatus;
  shelfLocation: string | null;
  notes: string | null;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CopiesPublicApi {
  availableCountsForBooks(bookIds: number[]): Promise<Map<number, number>>;
  getCopy(id: number): Promise<CopyPublicObject | null>;
  getCopyByBarcode(barcode: string): Promise<CopyPublicObject | null>;
}
