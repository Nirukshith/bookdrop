export const CATALOG_PUBLIC_API = Symbol('CATALOG_PUBLIC_API');

export interface CatalogPublicApi {
  exists(id: number): Promise<boolean>;
  findTitlesByIds(bookIds: number[]): Promise<Map<number, string>>;
  getBookPricesMinor(bookIds: number[]): Promise<Map<number, number | null>>;
  findBookById(id: number): Promise<{ id: number; title: string } | null>;
}
