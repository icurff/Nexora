describe('Supabase PostgreSQL configuration', () => {
  let createDatabaseOptions: typeof import('./config.js').createDatabaseOptions;
  const url =
    'postgresql://app.project:encoded%40password@pooler.example.test:5432/postgres';

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url);
    ({ createDatabaseOptions } = await import('./config.js'));
  });
  afterAll(() => vi.unstubAllEnvs());

  it('uses the connection URL and verifies the TLS server certificate', () => {
    expect(createDatabaseOptions({ DATABASE_URL: url })).toMatchObject({
      type: 'postgres',
      url,
      ssl: { rejectUnauthorized: true },
      synchronize: false,
      migrationsRun: false,
      migrationsTransactionMode: 'all',
    });
  });

  it('supports a PEM CA stored with escaped newlines in the environment', () => {
    expect(
      createDatabaseOptions({
        DATABASE_URL: url,
        DATABASE_SSL_CA: 'certificate\\nsecond line',
      }),
    ).toMatchObject({
      ssl: { rejectUnauthorized: true, ca: 'certificate\nsecond line' },
    });
  });

  it('requires a connection URL without exposing credentials in errors', () => {
    expect(() => createDatabaseOptions({})).toThrow('DATABASE_URL');
    for (const value of [
      'invalid-secret',
      'https://user:private-password@host/db',
      'postgresql://host/db',
    ]) {
      try {
        createDatabaseOptions({ DATABASE_URL: value });
        expect.fail('Invalid connection URL should have been rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).not.toContain(value);
        expect((error as Error).message).toContain('DATABASE_URL');
      }
    }
  });

  it.each([
    'sslmode=disable',
    'sslmode=require',
    'sslmode=verify-full',
    'sslrootcert=ca.pem',
    'ssl=false',
  ])('rejects URL options that could override verified TLS: %s', (query) => {
    expect(() =>
      createDatabaseOptions({ DATABASE_URL: `${url}?${query}` }),
    ).toThrow('remove SSL query parameters');
  });
});
