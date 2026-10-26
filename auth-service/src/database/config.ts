import { loadEnvFile } from 'node:process';
import { DataSource, type DataSourceOptions } from 'typeorm';

try {
  loadEnvFile('.env');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim())
    throw new Error(`Missing required database configuration: ${name}`);
  return value;
}

function port(): number {
  const raw = required('DB_PORT');
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('Invalid database configuration: DB_PORT must be 1–65535');
  }
  return value;
}

export function createDatabaseOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: required('DB_HOST'),
    port: port(),
    database: required('DB_NAME'),
    username: required('DB_USER'),
    password: required('DB_PASSWORD'),
    synchronize: false,
    migrationsRun: false,
    logging: false,
    migrationsTransactionMode: 'all',
  };
}

export const AppDataSource = new DataSource(createDatabaseOptions());
