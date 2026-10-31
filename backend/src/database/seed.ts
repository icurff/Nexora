import bcrypt from 'bcrypt';
import type { PrismaService } from './prisma.service.js';

export interface DemoSeedConfig {
  customerEmail?: string;
  customerPassword?: string;
  adminEmail?: string;
  adminPassword?: string;
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
  if ([...password].length < 6) {
    throw new Error(
      `${variable} must be at least 6 characters`,
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
  if (Boolean(customerEmailValue) !== Boolean(customerPassword)) {
    throw new Error(
      'Demo customer seed requires both DEMO_CUSTOMER_EMAIL and DEMO_CUSTOMER_PASSWORD',
    );
  }
  if (Boolean(adminEmailValue) !== Boolean(adminPassword)) {
    throw new Error(
      'Demo admin seed requires both DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD',
    );
  }
  if (!customerEmailValue && !adminEmailValue) {
    throw new Error('Demo seed requires at least one configured demo account');
  }

  const customerEmail = customerEmailValue
    ? validateEmail(customerEmailValue, 'DEMO_CUSTOMER_EMAIL')
    : undefined;
  const adminEmail = adminEmailValue
    ? validateEmail(adminEmailValue, 'DEMO_ADMIN_EMAIL')
    : undefined;
  if (customerEmail && customerEmail === adminEmail) {
    throw new Error('Demo account emails must be different');
  }
  if (customerPassword) {
    validatePassword(customerPassword, 'DEMO_CUSTOMER_PASSWORD');
  }
  if (adminPassword) validatePassword(adminPassword, 'DEMO_ADMIN_PASSWORD');

  return { customerEmail, customerPassword, adminEmail, adminPassword };
}

export async function seedDemoAccounts(
  prisma: PrismaService,
  config: DemoSeedConfig,
): Promise<{ customerCreated: boolean; adminCreated: boolean }> {
  const [customerHash, adminHash] = await Promise.all([
    config.customerPassword
      ? bcrypt.hash(config.customerPassword, 6)
      : undefined,
    config.adminPassword ? bcrypt.hash(config.adminPassword, 6) : undefined,
  ]);
  return prisma.transaction(async (transaction) => {
    let customerCreated = false;
    let adminCreated = false;
    if (config.customerEmail && customerHash) {
      const customer = await transaction.user.createMany({
        data: [
          {
            email: config.customerEmail,
            passwordHash: customerHash,
            fullName: 'Demo Customer',
            role: 'CUSTOMER',
            status: 'ACTIVE',
          },
        ],
        skipDuplicates: true,
      });
      customerCreated = customer.count === 1;
    }
    if (config.adminEmail && adminHash) {
      const admin = await transaction.user.createMany({
        data: [
          {
            email: config.adminEmail,
            passwordHash: adminHash,
            fullName: 'Demo Admin',
            role: 'ADMIN',
            status: 'ACTIVE',
          },
        ],
        skipDuplicates: true,
      });
      adminCreated = admin.count === 1;
    }
    return { customerCreated, adminCreated };
  });
}
