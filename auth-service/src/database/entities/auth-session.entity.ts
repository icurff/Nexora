import type { User } from './user.entity.js';

export type SessionRevokeReason =
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_REUSE';

export class AuthSession {
  id!: string;
  userId!: string;
  refreshTokenHash!: string;
  refreshVersion!: number;
  expiresAt!: Date;
  lastUsedAt!: Date;
  revokedAt!: Date | null;
  revokeReason!: SessionRevokeReason | null;
  createdAt!: Date;
  user?: User;
}
