export class BookPriceChangedEvent {
  public static readonly EVENT_NAME = 'book.price_changed';
  public readonly eventName = 'book.price_changed';
  public readonly domain = 'book';

  constructor(
    public readonly bookId: number,
    public readonly oldPriceMinor: number | null,
    public readonly newPriceMinor: number | null,
    public readonly actorId: number | null = null,
    public readonly occurredAt: Date = new Date(),
  ) {}

  get from(): number | null {
    return this.oldPriceMinor;
  }

  get to(): number | null {
    return this.newPriceMinor;
  }
}
