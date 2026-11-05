import {
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import {
  Reservation,
  ReservationCancelReason,
  ReservationStatus,
  Role,
} from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { BookModel } from '../../books/models/book.model';
import { UserModel } from '../../users/models/user.model';
import { HoldModel } from '../holds/models/hold.model';
import { ReservationsService } from './reservations.service';
import { ReservationsDataLoader } from './reservations.loader';
import { ReservationModel } from './models/reservation.model';
import { ReservationNotFoundError } from './errors';

@Resolver(() => ReservationModel)
@UseGuards(RolesGuard)
export class ReservationsResolver {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly reservationsDataLoader: ReservationsDataLoader,
    private readonly prisma: PrismaService,
  ) {}

  // -------------------------------------------------------------
  // MUTATIONS
  // -------------------------------------------------------------

  /**
   * Member joins the waiting list for a book with 0 available copies.
   * Rate limited: 5 requests per minute.
   */
  @Mutation(() => ReservationModel, { name: 'joinReservationQueue' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async joinReservationQueue(
    @Args('bookId', { type: () => Int }) bookId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Reservation & { position: number }> {
    return this.reservationsService.joinQueue(user.sub, bookId);
  }

  /**
   * Cancels an active WAITING reservation.
   * Member can cancel own; staff can cancel any.
   */
  @Mutation(() => ReservationModel, { name: 'cancelReservation' })
  async cancelReservation(
    @Args('reservationId', { type: () => Int }) reservationId: number,
    @Args('reason', { type: () => String, nullable: true })
    reason: string | null,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Reservation> {
    const cancelReason =
      user.role === Role.MEMBER
        ? ReservationCancelReason.MEMBER
        : ReservationCancelReason.STAFF;

    return this.reservationsService.leaveQueue(
      reservationId,
      { id: user.sub, role: user.role as Role },
      cancelReason,
    );
  }

  // -------------------------------------------------------------
  // QUERIES
  // -------------------------------------------------------------

  /**
   * Returns all reservations for the caller ordered by createdAt DESC with their queue positions.
   */
  @Query(() => [ReservationModel], { name: 'myReservations' })
  async myReservations(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Array<Reservation & { position: number | null }>> {
    return this.reservationsService.myReservations(user.sub);
  }

  /**
   * Staff only (LIBRARIAN and ADMIN): Returns all WAITING reservations for a book in FIFO order.
   */
  @Query(() => [ReservationModel], { name: 'queueForBook' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async queueForBook(
    @Args('bookId', { type: () => Int }) bookId: number,
  ): Promise<Array<Reservation & { position: number }>> {
    return this.reservationsService.getQueueForBook(bookId);
  }

  /**
   * Reads a single reservation by ID.
   * Members may only view their own; staff may view any.
   */
  @Query(() => ReservationModel, { name: 'reservation', nullable: true })
  async reservation(
    @Args('id', { type: () => Int }) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<(Reservation & { position?: number | null }) | null> {
    const res = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!res) {
      throw new ReservationNotFoundError(id);
    }

    if (user.role === Role.MEMBER && res.userId !== user.sub) {
      throw new ForbiddenException(
        'You are not authorized to view another member’s reservation',
      );
    }

    const position = await this.reservationsService.getQueuePosition(id);

    return {
      ...res,
      position,
    };
  }

  // -------------------------------------------------------------
  // FIELD RESOLVERS
  // -------------------------------------------------------------

  @ResolveField(() => Int, {
    name: 'position',
    nullable: true,
    description: '1-based queue position if WAITING, null otherwise',
  })
  async resolvePosition(
    @Parent() reservation: Reservation & { position?: number | null },
  ): Promise<number | null> {
    if (reservation.position !== undefined) {
      return reservation.position;
    }

    if (reservation.status !== ReservationStatus.WAITING) {
      return null;
    }

    return this.reservationsService.getQueuePosition(reservation.id);
  }

  @ResolveField(() => BookModel, { name: 'book', nullable: true })
  async resolveBook(
    @Parent() reservation: Reservation,
  ): Promise<BookModel | null> {
    return this.reservationsDataLoader.loadBook(reservation.bookId);
  }

  @ResolveField(() => UserModel, { name: 'user', nullable: true })
  async resolveUser(
    @Parent() reservation: Reservation,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<UserModel | null> {
    if (!user) {
      return null;
    }

    // Only staff or the reservation's owner can view patron user profile
    if (user.role === Role.MEMBER && reservation.userId !== user.sub) {
      return null;
    }

    const member = await this.reservationsDataLoader.loadUser(
      reservation.userId,
    );
    if (!member) {
      return null;
    }

    return {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  @ResolveField(() => HoldModel, { name: 'hold', nullable: true })
  async resolveHold(
    @Parent() reservation: Reservation,
  ): Promise<HoldModel | null> {
    if (!reservation.holdId) {
      return null;
    }

    return this.reservationsDataLoader.loadHold(reservation.holdId);
  }
}
