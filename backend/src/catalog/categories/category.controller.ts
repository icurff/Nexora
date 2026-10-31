import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../shared/guards/auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto.js';
import { CategoryService } from './category.service.js';

@Controller('admin/categories')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.categories.get(id);
  }

  @Post()
  create(@Body() body: CreateCategoryDto) {
    return this.categories.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.categories.update(id, body);
  }
}
