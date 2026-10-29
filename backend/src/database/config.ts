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
  // node-postgres URL TLS options override the explicit SSL object, including CA
  // and verification settings. Keep TLS configuration in one trusted location.
  if (
    [...parsed.searchParams.keys()].some((key) =>
      key.toLowerCase().startsWith('ssl'),
    )
  ) {
    throw new Error(
      'Configure TLS with DATABASE_SSL_CA; remove SSL query parameters from DATABASE_URL',
    );
  }
  const ca = environment.DATABASE_SSL_CA?.trim().replace(/\\n/g, '\n');
  return {
    connectionString,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
  };
}
