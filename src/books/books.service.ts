import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CopyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookInput } from './dto/create-book.input';
import { GetBooksArgs } from './dto/get-books.args';
import { UpdateBookInput } from './dto/update-book.input';
import { BookModel } from './models/book.model';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

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
        copies: {
          where: {
            status: CopyStatus.AVAILABLE,
          },
        },
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
        copies: {
          where: {
            status: CopyStatus.AVAILABLE,
          },
        },
      },
    });

    if (!book) {
      return null;
    }

    return this.mapToModel(book);
  }

  async create(input: CreateBookInput): Promise<BookModel> {
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
          copies: {
            where: { status: CopyStatus.AVAILABLE },
          },
        },
      });

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

  async update(id: number, input: UpdateBookInput): Promise<BookModel> {
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

    try {
      const updatedBook = await this.prisma.book.update({
        where: { id },
        data,
        include: {
          authors: true,
          categories: true,
          copies: {
            where: { status: CopyStatus.AVAILABLE },
          },
        },
      });

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
      availableCopiesCount: book.copies ? book.copies.length : 0,
    };
  }
}
