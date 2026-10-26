import bcrypt from 'bcrypt';
import type { DataSource, QueryRunner } from 'typeorm';

export interface DemoSeedConfig {
  customerEmail: string;
  customerPassword: string;
  adminEmail: string;
  adminPassword: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string, variable: string): string {
  const normalized = normalizeEmail(email);
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error(`${variable} must be a valid email address`);
  }
  return normalized;
}

function validatePassword(password: string, variable: string): void {
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (password.length < 8 || byteLength > 72) {
    throw new Error(
      `${variable} must be at least 8 characters and at most 72 UTF-8 bytes`,
    );
  }
}

export function readDemoSeedConfig(
  environment: NodeJS.ProcessEnv = process.env,
): DemoSeedConfig {
  const customerEmailValue = environment.DEMO_CUSTOMER_EMAIL;
  const customerPassword = environment.DEMO_CUSTOMER_PASSWORD;
  const adminEmailValue = environment.DEMO_ADMIN_EMAIL;
  const adminPassword = environment.DEMO_ADMIN_PASSWORD;
  if (
    !customerEmailValue ||
    !customerPassword ||
    !adminEmailValue ||
    !adminPassword
  ) {
    throw new Error('Demo seed requires both account emails and passwords');
  }

  const customerEmail = validateEmail(
    customerEmailValue,
    'DEMO_CUSTOMER_EMAIL',
  );
  const adminEmail = validateEmail(adminEmailValue, 'DEMO_ADMIN_EMAIL');
  if (customerEmail === adminEmail) {
    throw new Error('Demo account emails must be different');
  }
  validatePassword(customerPassword, 'DEMO_CUSTOMER_PASSWORD');
  validatePassword(adminPassword, 'DEMO_ADMIN_PASSWORD');

  return { customerEmail, customerPassword, adminEmail, adminPassword };
}

async function insertIfMissing(
  queryRunner: QueryRunner,
  email: string,
  password: string,
  fullName: string,
  role: 'CUSTOMER' | 'ADMIN',
): Promise<boolean> {
  const passwordHash = await bcrypt.hash(password, 12);
  const rows = (await queryRunner.query(
    `INSERT INTO users (email, password_hash, full_name, role, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [email, passwordHash, fullName, role],
  )) as unknown as Array<{ id: string }>;
  return rows.length === 1;
}

export async function seedDemoAccounts(
  dataSource: DataSource,
  config: DemoSeedConfig,
): Promise<{ customerCreated: boolean; adminCreated: boolean }> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const customerCreated = await insertIfMissing(
      queryRunner,
      config.customerEmail,
      config.customerPassword,
      'Demo Customer',
      'CUSTOMER',
    );
    const adminCreated = await insertIfMissing(
      queryRunner,
      config.adminEmail,
      config.adminPassword,
      'Demo Admin',
      'ADMIN',
    );
    await queryRunner.commitTransaction();
    return { customerCreated, adminCreated };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
