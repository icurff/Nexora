import { PrismaService } from '../dist/database/prisma.service.js';
import { readDemoSeedConfig, seedDemoAccounts } from '../dist/database/seed.js';

const config = readDemoSeedConfig();
const prisma = new PrismaService();
try {
  const result = await seedDemoAccounts(prisma, config);
  console.log(`Demo seed complete. Customer: ${result.customerCreated ? 'created' : 'skipped'}; Admin: ${result.adminCreated ? 'created' : 'skipped'}.`);
} finally {
  await prisma.$disconnect();
}
