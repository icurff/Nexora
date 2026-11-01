import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentActor, type AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { AuthGuard } from '../../shared/guards/auth.guard.js';
import { RolesGuard } from '../../shared/guards/roles.guard.js';
import { AddProductImagesDto, CreateProductDto, ProductListQueryDto, SetProductStockDto, UpdateProductDto, UpdateProductImageDto, UpdateVariantDto, VariantInputDto } from './product.dto.js';
import { ProductService } from './product.service.js';
import { ImageUploadService, type UploadedMediaFile } from '../images/image-upload.service.js';
import { MAX_MEDIA_BYTES } from '../images/supabase-storage.adapter.js';

class PublicProductQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

@Controller('products')
export class PublicProductController {
  constructor(private readonly products: ProductService) {}

  @Get()
  list(@Query() query: PublicProductQueryDto) {
    return this.products.publicList(query.page, query.pageSize);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.publicGet(id);
  }
}

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductController {
  constructor(private readonly products: ProductService, private readonly imageUploads: ImageUploadService) {}

  @Post('images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES, files: 1 } }))
  uploadImage(@UploadedFile() file: UploadedMediaFile | undefined, @CurrentActor() actor: AuthenticatedActor) {
    return this.imageUploads.upload(file, actor);
  }

  @Get('products') list(@Query() query: ProductListQueryDto) { return this.products.list(query); }
  @Post('products') create(@Body() body: CreateProductDto) { return this.products.create(body); }
  @Get('products/:id') get(@Param('id') id: string) { return this.products.get(id); }
  @Patch('products/:id') update(@Param('id') id: string, @Body() body: UpdateProductDto) { return this.products.update(id, body); }
  @Patch('products/:id/inventory') setProductStock(@Param('id') id: string, @Body() body: SetProductStockDto) { return this.products.setProductStock(id, body.onHand); }
  @Post('products/:id/variants') addVariant(@Param('id') id: string, @Body() body: VariantInputDto) { return this.products.addVariant(id, body); }
  @Patch('variants/:id') updateVariant(@Param('id') id: string, @Body() body: UpdateVariantDto) { return this.products.updateVariant(id, body); }
  @Delete('variants/:id') deleteVariant(@Param('id') id: string) { return this.products.deleteVariant(id); }
  @Post('products/:id/images') addImages(@Param('id') id: string, @Body() body: AddProductImagesDto) { return this.products.addImages(id, body); }
  @Patch('products/:id/images/:imageId') updateImage(@Param('id') id: string, @Param('imageId') imageId: string, @Body() body: UpdateProductImageDto) { return this.products.updateImage(id, imageId, body); }
  @Delete('products/:id/images/:imageId') deleteImage(@Param('id') id: string, @Param('imageId') imageId: string) { return this.products.deleteImage(id, imageId); }
}
