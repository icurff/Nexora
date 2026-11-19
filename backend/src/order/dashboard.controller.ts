import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { Roles } from '../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../shared/guards/auth.guard.js';
import { RolesGuard } from '../shared/guards/roles.guard.js';
import { DashboardService } from './dashboard.service.js';

class DashboardQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
@Controller('admin/dashboard')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get() get(@Query() query: DashboardQueryDto) {
    return this.dashboard.get(query.from, query.to);
  }
}
