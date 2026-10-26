import { AppDataSource } from './config.js';
import { CreateAuthAccountsAndSessions1 } from './migrations/1-create-auth-accounts-and-sessions.js';

const migrations = [new CreateAuthAccountsAndSessions1()];

export async function runMigrations(): Promise<void> {
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS auth_schema_migrations (
      id integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const rows = (await AppDataSource.query(
    'SELECT id FROM auth_schema_migrations',
  )) as unknown as Array<{ id: number }>;
  const applied = new Set(rows.map((row) => Number(row.id)));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await AppDataSource.transaction(async (manager) => {
      if (!manager.queryRunner)
        throw new Error('Migration transaction unavailable');
      await migration.up(manager.queryRunner);
      await manager.query(
        'INSERT INTO auth_schema_migrations (id) VALUES ($1)',
        [migration.id],
      );
    });
    process.stdout.write(`Applied migration ${migration.id}.\n`);
  }
}
