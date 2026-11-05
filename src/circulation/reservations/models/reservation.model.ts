import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ReservationCancelReason, ReservationStatus } from '@prisma/client';
import { BookModel } from '../../../books/models/book.model';
import { UserModel } from '../../../users/models/user.model';
import { HoldModel } from '../../holds/models/hold.model';

registerEnumType(ReservationStatus, {
  name: 'ReservationStatus',
  description:
    'Lifecycle statuses for patron book reservations (queue entries)',
});

registerEnumType(ReservationCancelReason, {
  name: 'ReservationCancelReason',
  description: 'Reason an active waiting reservation was cancelled',
});

@ObjectType('Reservation')
export class ReservationModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  bookId: number;

  @Field(() => ReservationStatus)
  status: ReservationStatus;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  promotedAt?: Date | null;

  @Field(() => Int, { nullable: true })
  holdId?: number | null;

  @Field(() => Date, { nullable: true })
  cancelledAt?: Date | null;

  @Field(() => ReservationCancelReason, { nullable: true })
  cancelReason?: ReservationCancelReason | null;

  @Field(() => Int, { nullable: true })
  cancelledById?: number | null;

  @Field(() => Int, {
    nullable: true,
    description: '1-based queue position if WAITING, null otherwise',
  })
  position?: number | null;

  @Field(() => BookModel, { nullable: true })
  book?: BookModel | null;

  @Field(() => UserModel, { nullable: true })
  user?: UserModel | null;

  @Field(() => HoldModel, { nullable: true })
  hold?: HoldModel | null;
}
