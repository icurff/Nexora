import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  CategoryController,
  PublicCategoryController,
} from './categories/category.controller.js';
import { CategoryRepository } from './categories/category.repository.js';
import { CategoryService } from './categories/category.service.js';
import {
  ProductController,
  PublicProductController,
} from './products/product.controller.js';
import { ProductRepository } from './products/product.repository.js';
import { ProductService } from './products/product.service.js';
import { ImageUploadService } from './images/image-upload.service.js';
import { SupabaseStorageAdapter } from './images/supabase-storage.adapter.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryRepository } from './inventory/inventory.repository.js';
import { InventoryService } from './inventory/inventory.service.js';
import { EngagementController } from './engagement/engagement.controller.js';
import { EngagementRepository } from './engagement/engagement.repository.js';
import { EngagementService } from './engagement/engagement.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    CategoryController,
    PublicCategoryController,
    ProductController,
    PublicProductController,
    InventoryController,
    EngagementController,
  ],
  providers: [
    CategoryService,
    CategoryRepository,
    ProductService,
    ProductRepository,
    ImageUploadService,
    SupabaseStorageAdapter,
    InventoryService,
    InventoryRepository,
    EngagementRepository,
    EngagementService,
  ],
  exports: [ProductService],
})
export class CatalogModule {}
