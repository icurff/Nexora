import { afterEach, expect, it } from 'vitest';
import { PayOS } from '@payos/node';
import { PayosService } from './payos.service.js';

afterEach(() => {
  delete process.env.PAYOS_CLIENT_ID;
  delete process.env.PAYOS_API_KEY;
  delete process.env.PAYOS_CHECKSUM_KEY;
});

it('accepts a signed payOS payload and rejects a modified amount', async () => {
  process.env.PAYOS_CLIENT_ID = 'test';
  process.env.PAYOS_API_KEY = 'test';
  process.env.PAYOS_CHECKSUM_KEY = 'secret-for-test';
  const sdk = new PayOS({
    clientId: 'test',
    apiKey: 'test',
    checksumKey: 'secret-for-test',
  });
  const data = {
    orderCode: 123,
    amount: 130000,
    currency: 'VND',
    reference: 'ref1',
    paymentLinkId: 'link1',
    transactionDateTime: '2026-11-28 09:00:00',
    code: '00',
    desc: '',
    description: '',
    accountNumber: '',
  };
  const signature = await sdk.crypto.createSignatureFromObj(
    data,
    'secret-for-test',
  );
  const payload = {
    success: true,
    code: '00',
    desc: '',
    signature: signature!,
    data,
  };
  const prisma = {
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({
        payosPaymentRequest: { findUnique: () => Promise.resolve(null) },
      }),
  };
  const service = new PayosService(prisma as never);
  await expect(service.webhook(payload)).rejects.toMatchObject({
    response: { code: 'PAYOS_REQUEST_NOT_FOUND' },
  });
  await expect(
    service.webhook({ ...payload, data: { ...data, amount: 1 } }),
  ).rejects.toMatchObject({ response: { code: 'PAYOS_SIGNATURE_INVALID' } });
});
