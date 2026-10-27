import { AppDataSource } from './config.js';
import { runMigrations } from './migrate.js';
import { readDemoSeedConfig, seedDemoAccounts } from './seed.js';

const command = process.argv[2];

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    switch (command) {
      case 'migration:run':
        await runMigrations();
        process.stdout.write('Migrations applied.\n');
        break;
      case 'seed:demo': {
        const config = readDemoSeedConfig();
        const result = await seedDemoAccounts(AppDataSource, config);
        process.stdout.write(
          `Demo seed complete. Customer: ${result.customerCreated ? 'created' : 'skipped'}; Admin: ${result.adminCreated ? 'created' : 'skipped'}.\n`,
        );
        break;
      }
      default:
        throw new Error('Use migration:run or seed:demo');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

await main();
