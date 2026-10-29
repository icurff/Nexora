import type { User as PrismaUser, AuthSession as PrismaSession } from '../../generated/prisma/client.js';
import type { User } from '../entities/user.entity.js';
import type { AuthSession } from '../entities/auth-session.entity.js';

export function toUser(row: PrismaUser): User {
  if (row.role !== 'CUSTOMER' && row.role !== 'ADMIN') throw new Error('Invalid persisted user role');
  if (row.status !== 'ACTIVE' && row.status !== 'LOCKED') throw new Error('Invalid persisted user status');
  return { ...row, id: row.id.toString(), role: row.role, status: row.status };
}

export function toSession(row: PrismaSession): AuthSession {
  return {
    ...row,
    id: row.id.toString(),
    userId: row.userId.toString(),
    // The baseline CHECK constraint restricts this column to these reasons.
    revokeReason: row.revokeReason as AuthSession['revokeReason'],
  };
}
