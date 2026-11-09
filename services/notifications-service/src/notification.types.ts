import { NotificationStatus, NotificationTemplate } from '@prisma/client';

export { NotificationStatus, NotificationTemplate };

export interface MappedNotification {
  userId: number;
  template: NotificationTemplate;
  dedupeKey: string;
  payload: Record<string, any>;
  validUntil?: Date;
}

