export type UserRole = 'CUSTOMER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'LOCKED';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  lockedAt: Date | null;
  lockReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}
