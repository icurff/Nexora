import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoryController } from './categories/category.controller.js';
import { CategoryRepository } from './categories/category.repository.js';
import { CategoryService } from './categories/category.service.js';
import { ProductController } from './products/product.controller.js';
import { ProductRepository } from './products/product.repository.js';
import { ProductService } from './products/product.service.js';
import { ImageUploadService } from './images/image-upload.service.js';
import { SupabaseStorageAdapter } from './images/supabase-storage.adapter.js';

@Module({
  imports: [AuthModule],
  controllers: [CategoryController, ProductController],
  providers: [CategoryService, CategoryRepository, ProductService, ProductRepository, ImageUploadService, SupabaseStorageAdapter],
})
export class CatalogModule {}
