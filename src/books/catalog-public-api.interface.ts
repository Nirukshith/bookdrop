export interface CatalogPublicApi {
  exists(id: number): Promise<boolean>;
  findTitlesByIds(bookIds: number[]): Promise<Map<number, string>>;
  getBookPricesMinor(bookIds: number[]): Promise<Map<number, number | null>>;
}
