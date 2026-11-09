export const DOMAIN_EVENT_NAMES = {
  USER_REGISTERED: 'user.registered',
  USER_ROLE_CHANGED: 'user.role_changed',
} as const;

export interface UserRegisteredPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
  occurredAt: Date;
}

