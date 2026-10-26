import { EntitySchema } from 'typeorm';
import type { EntitySchemaColumnOptions } from 'typeorm';
import { User } from './user.entity.js';

export const UserSchema = new EntitySchema<User>({
  name: 'User',
  target: User,
  tableName: 'users',
  columns: {
    id: {
      type: 'bigint',
      primary: true,
      generated: true,
      generatedIdentity: 'ALWAYS',
    } as EntitySchemaColumnOptions,
    email: { type: 'varchar', length: 254, unique: true },
    passwordHash: {
      name: 'password_hash',
      type: 'varchar',
      length: 255,
      select: false,
    },
    fullName: { name: 'full_name', type: 'varchar', length: 100 },
    phone: { type: 'varchar', length: 16, nullable: true },
    role: { type: 'varchar', length: 16, default: 'CUSTOMER' },
    status: { type: 'varchar', length: 16, default: 'ACTIVE' },
    lockedAt: {
      name: 'locked_at',
      type: 'timestamptz',
      nullable: true,
    },
    lockReason: {
      name: 'lock_reason',
      type: 'varchar',
      length: 500,
      nullable: true,
    },
    createdAt: {
      name: 'created_at',
      type: 'timestamptz',
      createDate: true,
      default: () => 'CURRENT_TIMESTAMP',
    },
    updatedAt: {
      name: 'updated_at',
      type: 'timestamptz',
      updateDate: true,
      default: () => 'CURRENT_TIMESTAMP',
    },
  },
  checks: [
    {
      name: 'users_email_normalized_check',
      expression: `email = lower(btrim(email)) AND email <> ''`,
    },
    {
      name: 'users_full_name_check',
      expression: `full_name = btrim(full_name) AND char_length(full_name) BETWEEN 1 AND 100`,
    },
    {
      name: 'users_role_check',
      expression: `role IN ('CUSTOMER', 'ADMIN')`,
    },
    {
      name: 'users_status_check',
      expression: `status IN ('ACTIVE', 'LOCKED')`,
    },
    {
      name: 'users_lock_state_check',
      expression: `(status = 'ACTIVE' AND locked_at IS NULL AND lock_reason IS NULL) OR (status = 'LOCKED' AND locked_at IS NOT NULL AND lock_reason IS NOT NULL AND btrim(lock_reason) <> '')`,
    },
    {
      name: 'users_phone_check',
      expression: `phone IS NULL OR phone ~ '^\\+?[0-9]{10,15}$'`,
    },
  ],
});
