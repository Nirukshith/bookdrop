import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DOMAIN_EVENT_NAMES } from '../contracts/events';
import { CreateBookInput } from './dto/create-book.input';
import { GetBooksArgs } from './dto/get-books.args';
import { UpdateBookInput } from './dto/update-book.input';
import { BookModel } from './models/book.model';
import { CatalogPublicApi } from './catalog-public-api.interface';
import { BookPriceChangedEvent } from './events/book-price-changed.event';
import { parseBookPriceToMinor } from './utils/book-price-edge.util';

@Injectable()
export class BooksService implements CatalogPublicApi {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(args: GetBooksArgs): Promise<BookModel[]> {
    const { search, categoryId, authorId, take = 10, skip = 0 } = args;

    const where: Prisma.BookWhereInput = {};

    if (search && search.trim().length > 0) {
      where.title = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    if (categoryId) {
      where.categories = {
        some: { id: categoryId },
      };
    }

    if (authorId) {
      where.authors = {
        some: { id: authorId },
      };
    }

    const books = await this.prisma.book.findMany({
      where,
      take,
      skip,
      include: {
        authors: true,
        categories: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return books.map((book) => this.mapToModel(book));
  }

  async findById(id: number): Promise<BookModel | null> {
    const book = await this.prisma.book.findUnique({
      where: { id },
      include: {
        authors: true,
        categories: true,
      },
    });

    if (!book) {
      return null;
    }

    return this.mapToModel(book);
  }

  async findBookById(id: number): Promise<BookModel | null> {
    return this.findById(id);
  }

  async exists(id: number): Promise<boolean> {
    const count = await this.prisma.book.count({
      where: { id },
    });
    return count > 0;
  }

  /**
   * Batched lookup returning book titles for given book IDs.
   * Employs select: { id: true, title: true } to minimize database I/O.
   * Used by DataLoader to eliminate N+1 cross-domain queries.
   */
  async findTitlesByIds(bookIds: number[]): Promise<Map<number, string>> {
    if (!bookIds || bookIds.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(bookIds));
    const books = await this.prisma.book.findMany({
      where: {
        id: { in: uniqueIds },
      },
      select: {
        id: true,
        title: true,
      },
    });

    const map = new Map<number, string>();
    for (const book of books) {
      map.set(book.id, book.title);
    }
    return map;
  }

  /**
   * Batched lookup returning book replacement prices (in minor units) for given book IDs.
   * Null in the map indicates the book has no replacement price configured.
   * Used across domain boundaries by Circulation without coupling to Book entities.
   */
  async getBookPricesMinor(
    bookIds: number[],
  ): Promise<Map<number, number | null>> {
    if (!bookIds || bookIds.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(bookIds));
    const books = await this.prisma.book.findMany({
      where: {
        id: { in: uniqueIds },
      },
      select: {
        id: true,
        priceMinor: true,
      },
    });

    const map = new Map<number, number | null>();
    for (const id of uniqueIds) {
      map.set(id, null);
    }
    for (const book of books) {
      map.set(book.id, book.priceMinor);
    }
    return map;
  }

  // check if the authorids and category ids passed are valid, otherwise throw a bad request exception
  // then check if the book with the same isbn already exists, otherwise throw a conflict exception
  // then create the book
  async create(
    input: CreateBookInput,
    actorId?: number | null,
  ): Promise<BookModel> {
    const priceMinor = parseBookPriceToMinor(input.priceRs);

    if (input.authorIds?.length) {
      const authorsCount = await this.prisma.author.count({
        where: { id: { in: input.authorIds } },
      });
      if (authorsCount !== input.authorIds.length) {
        throw new BadRequestException('One or more author IDs are invalid');
      }
    }

    if (input.categoryIds?.length) {
      const categoriesCount = await this.prisma.category.count({
        where: { id: { in: input.categoryIds } },
      });
      if (categoriesCount !== input.categoryIds.length) {
        throw new BadRequestException('One or more category IDs are invalid');
      }
    }
    // check if the book with the same isbn already exists
    const existingIsbn = await this.prisma.book.findUnique({
      where: { isbn: input.isbn.trim() },
    });
    if (existingIsbn) {
      throw new ConflictException('A book with this ISBN already exists');
    }

    try {
      const book = await this.prisma.book.create({
        data: {
          title: input.title.trim(),
          isbn: input.isbn.trim(),
          description: input.description?.trim(),
          publishedYear: input.publishedYear,
          priceMinor,
          authors: {
            connect: input.authorIds.map((id) => ({ id })),
          },
          categories: {
            connect: input.categoryIds.map((id) => ({ id })),
          },
        },
        include: {
          authors: true,
          categories: true,
        },
      });

      if (priceMinor !== null) {
        this.eventEmitter.emit(
          DOMAIN_EVENT_NAMES.BOOK_PRICE_CHANGED,
          new BookPriceChangedEvent(book.id, null, priceMinor, actorId ?? null),
        );
      }

      return this.mapToModel(book);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A book with this ISBN already exists');
      }
      throw error;
    }
  }

  // update a book by id, if no value is passed, it will not be updated
  // if the new isbn we input matches with another book, it will throw a conflict exception
  async update(
    id: number,
    input: UpdateBookInput,
    actorId?: number | null,
  ): Promise<BookModel> {
    const existingBook = await this.prisma.book.findUnique({
      where: { id },
    });
    if (!existingBook) {
      throw new NotFoundException(`Book with ID ${id} not found`);
    }

    if (input.isbn && input.isbn.trim() !== existingBook.isbn) {
      const existingIsbn = await this.prisma.book.findUnique({
        where: { isbn: input.isbn.trim() },
      });
      if (existingIsbn) {
        throw new ConflictException('A book with this ISBN already exists');
      }
    }

    if (input.authorIds) {
      const authorsCount = await this.prisma.author.count({
        where: { id: { in: input.authorIds } },
      });
      if (authorsCount !== input.authorIds.length) {
        throw new BadRequestException('One or more author IDs are invalid');
      }
    }

    if (input.categoryIds) {
      const categoriesCount = await this.prisma.category.count({
        where: { id: { in: input.categoryIds } },
      });
      if (categoriesCount !== input.categoryIds.length) {
        throw new BadRequestException('One or more category IDs are invalid');
      }
    }

    const data: Prisma.BookUpdateInput = {};
    if (input.title !== undefined) {
      data.title = input.title.trim();
    }
    if (input.isbn !== undefined) {
      data.isbn = input.isbn.trim();
    }
    if (input.description !== undefined) {
      data.description = input.description.trim();
    }
    if (input.publishedYear !== undefined) {
      data.publishedYear = input.publishedYear;
    }
    if (input.authorIds !== undefined) {
      data.authors = {
        set: input.authorIds.map((id) => ({ id })),
      };
    }
    if (input.categoryIds !== undefined) {
      data.categories = {
        set: input.categoryIds.map((id) => ({ id })),
      };
    }

    let newPriceMinor: number | null | undefined = undefined;
    if (input.priceRs !== undefined) {
      newPriceMinor =
        input.priceRs === null ? null : parseBookPriceToMinor(input.priceRs);
      data.priceMinor = newPriceMinor;
    }

    try {
      const updatedBook = await this.prisma.book.update({
        where: { id },
        data,
        include: {
          authors: true,
          categories: true,
        },
      });

      if (
        input.priceRs !== undefined &&
        existingBook.priceMinor !== updatedBook.priceMinor
      ) {
        this.eventEmitter.emit(
          DOMAIN_EVENT_NAMES.BOOK_PRICE_CHANGED,
          new BookPriceChangedEvent(
            updatedBook.id,
            existingBook.priceMinor,
            updatedBook.priceMinor,
            actorId ?? null,
          ),
        );
      }

      return this.mapToModel(updatedBook);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A book with this ISBN already exists');
      }
      throw error;
    }
  }

  private mapToModel(book: any): BookModel {
    return {
      ...book,
      description: book.description ?? undefined,
      publishedYear: book.publishedYear ?? undefined,
      availableCopiesCount: book.availableCopiesCount ?? 0,
      availableCopies: book.availableCopies ?? 0,
      replacementPriceRs:
        book.priceMinor !== null && book.priceMinor !== undefined
          ? book.priceMinor / 100
          : null,
    };
  }
}
