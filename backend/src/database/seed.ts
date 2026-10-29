import bcrypt from 'bcrypt';
import type { PrismaService } from './prisma.service.js';

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

export async function seedDemoAccounts(
  prisma: PrismaService,
  config: DemoSeedConfig,
): Promise<{ customerCreated: boolean; adminCreated: boolean }> {
  const [customerHash, adminHash] = await Promise.all([
    bcrypt.hash(config.customerPassword, 6),
    bcrypt.hash(config.adminPassword, 6),
  ]);
  return prisma.transaction(async (transaction) => {
    const customer = await transaction.user.createMany({
      data: [{ email: config.customerEmail, passwordHash: customerHash, fullName: 'Demo Customer', role: 'CUSTOMER', status: 'ACTIVE' }],
      skipDuplicates: true,
    });
    const admin = await transaction.user.createMany({
      data: [{ email: config.adminEmail, passwordHash: adminHash, fullName: 'Demo Admin', role: 'ADMIN', status: 'ACTIVE' }],
      skipDuplicates: true,
    });
    return { customerCreated: customer.count === 1, adminCreated: admin.count === 1 };
  });
}
