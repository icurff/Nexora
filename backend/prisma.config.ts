import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'prisma/config';
import { createDatabaseOptions } from './src/database/config.js';

// Generation works without credentials in CI/Docker; DB commands require a URL.
let url: string | undefined;
if (process.env.DATABASE_URL?.trim()) {
  const options = createDatabaseOptions();
  const connection = new URL(options.connectionString!);
  // Prisma Migrate uses its native schema engine rather than the pg adapter.
  connection.searchParams.set('sslmode', 'require');
  connection.searchParams.set('sslaccept', 'strict');
  if (typeof options.ssl === 'object' && typeof options.ssl.ca === 'string') {
    const directory = mkdtempSync(join(tmpdir(), 'nexora-prisma-ca-'));
    const certificate = join(directory, 'root.crt');
    writeFileSync(certificate, options.ssl.ca, { mode: 0o600 });
    connection.searchParams.set('sslcert', certificate);
    process.once('exit', () => {
      unlinkSync(certificate);
      rmdirSync(directory);
    });
  }
  url = connection.toString();
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.mjs' },
  datasource: { url },
});
