import { loadEnvFile } from 'node:process';
import type { PoolConfig } from 'pg';

try {
  loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value?.trim())
    throw new Error(`Missing required database configuration: ${name}`);
  return value;
}

export function createDatabaseOptions(
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  const connectionString = required(environment, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(
      'Invalid database configuration: DATABASE_URL must be a PostgreSQL URL',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length <= 1
  ) {
    throw new Error(
      'Invalid database configuration: DATABASE_URL requires a PostgreSQL host, user, password and database',
    );
  }
  if ([...parsed.searchParams.keys()].some((key) => key.toLowerCase().startsWith('ssl'))) {
    throw new Error('Local PostgreSQL does not use SSL URL parameters');
  }
  return { connectionString, ssl: false };
}
