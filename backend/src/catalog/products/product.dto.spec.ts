import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateProductDto } from './product.dto.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const image = { imageAssetId: '1', sortOrder: 0, isPrimary: true };

describe('CreateProductDto initial inventory', () => {
  it('accepts Product-level stock when there are no SKUs', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Product',
          description: 'Description',
          categoryId: '2',
          priceVnd: 10000,
          onHand: 5,
          optionConfig: { options: [] },
          variants: [],
          images: [image],
        },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).resolves.toMatchObject({ onHand: 5, variants: [] });
  });

  it('accepts a separate price and initial stock for each SKU', async () => {
    await expect(
      pipe.transform(
        {
          name: 'Product',
          description: 'Description',
          categoryId: '2',
          optionConfig: { options: [{ code: 'color', label: 'Color' }] },
          variants: [
            { options: { color: 'Red' }, priceVnd: 10000, onHand: 3 },
            { options: { color: 'Blue' }, priceVnd: 12000, onHand: 7 },
          ],
          images: [image],
        },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).resolves.toMatchObject({
      variants: [
        { priceVnd: 10000, onHand: 3 },
        { priceVnd: 12000, onHand: 7 },
      ],
    });
  });

  it.each([-1, 1.5, 2_147_483_648])(
    'rejects invalid initial stock value %s',
    async (onHand) => {
      await expect(
        pipe.transform(
          {
            name: 'Product',
            description: 'Description',
            categoryId: '2',
            priceVnd: 10000,
            onHand,
            optionConfig: { options: [] },
            variants: [],
            images: [image],
          },
          { type: 'body', metatype: CreateProductDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
