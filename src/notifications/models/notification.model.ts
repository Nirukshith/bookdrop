import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';
import { NotificationStatus, NotificationTemplate } from '@prisma/client';

registerEnumType(NotificationStatus, {
  name: 'NotificationStatus',
  description: 'Delivery lifecycle status of an email notification',
});

registerEnumType(NotificationTemplate, {
  name: 'NotificationTemplate',
  description: 'Email template types supported by Bookdrop',
});

@ObjectType('Notification')
export class NotificationModel {
  @Field(() => ID)
  id: number;

  @Field(() => NotificationTemplate)
  template: NotificationTemplate;

  @Field(() => NotificationStatus)
  status: NotificationStatus;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  sentAt: Date | null;
}
