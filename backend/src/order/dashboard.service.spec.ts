import { describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service.js';

describe('dashboard date ranges', () => {
  it('uses an inclusive Ho Chi Minh City day range', async () => {
    const repository = { get: vi.fn().mockResolvedValue({ created: 0 }) };
    const service = new DashboardService(repository as never);
    await service.get('2026-11-01', '2026-11-02');
    expect(repository.get).toHaveBeenCalledWith(
      new Date('2026-10-31T17:00:00Z'),
      new Date('2026-11-02T17:00:00Z'),
      expect.any(Number),
    );
  });
  it('rejects impossible dates and reversed ranges', async () => {
    const service = new DashboardService({ get: vi.fn() } as never);
    await expect(service.get('2026-02-30', '2026-03-01')).rejects.toMatchObject(
      { response: { code: 'INVALID_DATE_RANGE' } },
    );
    await expect(service.get('2026-11-03', '2026-11-01')).rejects.toMatchObject(
      { response: { code: 'INVALID_DATE_RANGE' } },
    );
  });
});
