import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../dist/database/prisma.service.js';

// Only untouched products in the frozen RetailRocket demo can be enriched.
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbUrl.hostname)) {
  throw new Error('This script requires local PostgreSQL');
}
const original = parse(await readFile(new URL('../../dataset/demo_data/products_demo.csv', import.meta.url), 'utf8'), { columns: true, bom: true, skip_empty_lines: true });
const products = JSON.parse(await readFile(new URL('./beauty-products-demo.json', import.meta.url), 'utf8'));
const targets = original.filter(p => p.category_id === '4');
if (products.length !== targets.length || new Set(products.map(p => p.code)).size !== products.length) throw new Error('Unexpected source data');
const images = await Promise.all(products.map(async product => {
  const url = new URL(product.image_front_url);
  if (url.protocol !== 'https:' || url.hostname !== 'images.openbeautyfacts.org' || !/^\d+$/.test(product.code)) throw new Error('Invalid source');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'NexoraDemo/1.0 (local catalog demonstration)' } });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Image unavailable: ${product.code}`);
  const bytes = await response.arrayBuffer();
  return { contentType: response.headers.get('content-type').split(';')[0], length: bytes.byteLength };
}));
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, ch => ch === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
const prisma = new PrismaService();
try {
  const result = await prisma.$transaction(async tx => {
    const dataset = await tx.catalogDataset.findUnique({ where: { version: 'retailrocket-demo-v1' } });
    if (!dataset) throw new Error('Original demo dataset is not imported');
    const admin = await tx.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' }, orderBy: { id: 'asc' } });
    if (!admin) throw new Error('An active admin is required');
    let updated = 0, skipped = 0;
    for (let i = 0; i < targets.length; i++) {
      const originalRow = targets[i], source = products[i], image = images[i];
      const product = await tx.product.findUnique({ where: { seedDatasetId_seedProductId: { seedDatasetId: dataset.id, seedProductId: Number(originalRow.product_id) } }, include: { category: true, images: { include: { imageAsset: true } } } });
      if (!product || product.retailrocketItemId !== originalRow.source_item_id) throw new Error(`Provenance mismatch: ${originalRow.product_id}`);
      const primary = product.images.filter(x => x.isPrimary);
      if (product.name !== originalRow.name || product.description !== originalRow.description || product.category.seedCategoryId !== 4 || primary.length !== 1 || primary[0].imageAsset.bucket !== 'demo-local' || product.images.length !== 1) { skipped++; continue; }
      const name = source.product_name.trim().slice(0, 200);
      const description = `Sản phẩm minh họa: ${name}${source.brands ? `. Thương hiệu: ${source.brands.trim()}` : ''}. Nguồn thông tin và ảnh: Open Beauty Facts (https://world.openbeautyfacts.org/product/${source.code}). Giá và tồn kho là dữ liệu demo. Ánh xạ với RetailRocket chỉ dùng để minh họa.`;
      const path = `openbeautyfacts/${source.code}`;
      const asset = await tx.imageAsset.upsert({ where: { bucket_objectPath: { bucket: 'openbeautyfacts', objectPath: path } }, create: { uploadedById: admin.id, bucket: 'openbeautyfacts', objectPath: path, publicUrl: source.image_front_url, contentType: image.contentType, contentLength: image.length }, update: {} });
      await tx.product.update({ where: { id: product.id }, data: { name, nameKey: normalize(name), description } });
      await tx.productImage.update({ where: { id: primary[0].id }, data: { imageAssetId: asset.id, altText: name } });
      updated++;
    }
    return { updated, skipped };
  }, { timeout: 120000 });
  console.log(JSON.stringify(result));
} finally { await prisma.$disconnect(); }
