export const RABBITMQ_SERVICE = 'RABBITMQ_SERVICE';
export const BOOKDROP_EVENTS_EXCHANGE = 'bookdrop.events';
export const BOOKDROP_NOTIFICATIONS_QUEUE = 'bookdrop.notifications';

export const DOMAIN_EVENT_PATTERNS = [
  'hold.*',
  'loan.*',
  'fine.*',
  'reservation.*',
  'missed_pickup.*',
  'user.*',
  'copy.*',
  'book.*',
] as const;
