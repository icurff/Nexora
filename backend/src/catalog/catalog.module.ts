import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoryController } from './categories/category.controller.js';
import { CategoryRepository } from './categories/category.repository.js';
import { CategoryService } from './categories/category.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepository],
})
export class CatalogModule {}
