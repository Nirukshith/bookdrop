import { Injectable } from '@nestjs/common';
import { CopyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GetBooksArgs } from './dto/get-books.args';
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

    return books.map((book) => ({
      ...book,
      description: book.description ?? undefined,
      publishedYear: book.publishedYear ?? undefined,
      availableCopiesCount: book.copies.length,
    }));
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

    return {
      ...book,
      description: book.description ?? undefined,
      publishedYear: book.publishedYear ?? undefined,
      availableCopiesCount: book.copies.length,
    };
  }
}
