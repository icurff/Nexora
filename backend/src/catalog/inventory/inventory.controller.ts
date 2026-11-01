import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentActor,
  type AuthenticatedActor,
} from '../../shared/decorators/current-actor.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../../shared/guards/auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import {
  InventoryAdjustmentDto,
  InventoryListQueryDto,
} from './inventory.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('admin/inventory')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query() query: InventoryListQueryDto) {
    return this.inventory.list(query);
  }

  @Get(':skuId')
  get(@Param('skuId') skuId: string) {
    return this.inventory.get(skuId);
  }

  @Post(':skuId/adjustments')
  adjust(
    @Param('skuId') skuId: string,
    @Body() body: InventoryAdjustmentDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.inventory.adjust(skuId, body, actor);
  }
}
