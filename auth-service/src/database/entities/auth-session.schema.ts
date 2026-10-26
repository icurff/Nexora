import { EntitySchema } from 'typeorm';
import type { EntitySchemaColumnOptions } from 'typeorm';
import { AuthSession } from './auth-session.entity.js';

export const AuthSessionSchema = new EntitySchema<AuthSession>({
  name: 'AuthSession',
  target: AuthSession,
  tableName: 'auth_sessions',
  columns: {
    id: {
      type: 'bigint',
      primary: true,
      generated: true,
      generatedIdentity: 'ALWAYS',
    } as EntitySchemaColumnOptions,
    userId: { name: 'user_id', type: 'bigint' },
    refreshTokenHash: {
      name: 'refresh_token_hash',
      type: 'char',
      length: 64,
      unique: true,
      select: false,
    },
    refreshVersion: {
      name: 'refresh_version',
      type: 'integer',
      default: 0,
    },
    expiresAt: { name: 'expires_at', type: 'timestamptz' },
    lastUsedAt: { name: 'last_used_at', type: 'timestamptz' },
    revokedAt: {
      name: 'revoked_at',
      type: 'timestamptz',
      nullable: true,
    },
    revokeReason: {
      name: 'revoke_reason',
      type: 'varchar',
      length: 50,
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'timestamptz',
      createDate: true,
      default: () => 'CURRENT_TIMESTAMP',
    },
  },
  relations: {
    user: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'user_id', referencedColumnName: 'id' },
      onDelete: 'RESTRICT',
    },
  },
  indices: [
    {
      name: 'auth_sessions_user_revoked_idx',
      columns: ['userId', 'revokedAt'],
    },
  ],
  checks: [
    {
      name: 'auth_sessions_refresh_hash_check',
      expression: `refresh_token_hash ~ '^[0-9a-f]{64}$'`,
    },
    {
      name: 'auth_sessions_refresh_version_check',
      expression: `refresh_version >= 0`,
    },
    {
      name: 'auth_sessions_expiry_check',
      expression: `expires_at > created_at`,
    },
    {
      name: 'auth_sessions_revoke_reason_check',
      expression: `revoke_reason IS NULL OR revoke_reason IN ('LOGOUT', 'PASSWORD_CHANGED', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'TOKEN_REUSE')`,
    },
    {
      name: 'auth_sessions_revocation_pair_check',
      expression: `(revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)`,
    },
  ],
});
