export type SessionRevokeReason =
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_REUSE';

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  refreshVersion: number;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  revokeReason: SessionRevokeReason | null;
  createdAt: Date;
}
