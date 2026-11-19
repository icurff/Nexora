import { BadRequestException, Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository.js';

function day(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new BadRequestException({ code: 'INVALID_DATE_RANGE' });
  const date = new Date(`${value}T00:00:00+07:00`);
  if (
    !Number.isFinite(date.valueOf()) ||
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date) !== value
  )
    throw new BadRequestException({ code: 'INVALID_DATE_RANGE' });
  return date;
}
@Injectable()
export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}
  async get(from?: string, to?: string) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const first = from ?? today;
    const last = to ?? today;
    const start = day(first);
    const end = day(last);
    if (start > end)
      throw new BadRequestException({ code: 'INVALID_DATE_RANGE' });
    end.setUTCDate(end.getUTCDate() + 1);
    const configured = Number(process.env.LOW_STOCK_THRESHOLD ?? 5);
    const threshold =
      Number.isInteger(configured) && configured >= 0 ? configured : 5;
    return {
      from: first,
      to: last,
      lowStockThreshold: threshold,
      ...(await this.repository.get(start, end, threshold)),
    };
  }
}
