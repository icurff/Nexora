import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import { PrismaService } from '../dist/database/prisma.service.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const inputDir = path.join(root, 'dataset', 'demo_data');
const assetDir = path.join(root, 'frontend', 'public', 'demo-catalog');
const manifest = JSON.parse((await readFile(new URL('./demo-catalog-manifest.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const sha = value => createHash('sha256').update(value).digest('hex');
const datasetChecksum = sha(JSON.stringify(manifest.files));
const expectedHeaders = {
  'products_demo.csv': 'product_id,source_item_id,sku,name,brand,category_id,category_name,price,stock,image_url,description,is_active,interactions,users',
  'categories_demo.csv': 'category_id,root_categoryid,category_name',
  'category_mapping.csv': 'categoryid,root_categoryid,category_id,category_name',
};
const expectedCounts = { 'products_demo.csv': 500, 'categories_demo.csv': 23, 'category_mapping.csv': 1664 };
const rows = {};
for (const [name, checksum] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(inputDir, name));
  if (sha(bytes) !== checksum) throw Error(`Checksum mismatch: ${name}`);
  const parsed = parse(bytes, { bom: true, skip_empty_lines: true });
  if (parsed[0].join(',') !== expectedHeaders[name] || parsed.length - 1 !== expectedCounts[name]) throw Error(`Unexpected CSV schema or row count: ${name}`);
  rows[name] = parsed.slice(1).map(row => Object.fromEntries(parsed[0].map((key, i) => [key, row[i]])));
}
const integer = (value, label, min, max = 2147483647) => {
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw Error(`Invalid ${label}`);
  return Number(value);
};
const unique = (items, key, label) => {
  const values = items.map(item => item[key]);
  if (values.some(value => !value?.trim()) || new Set(values).size !== values.length) throw Error(`Missing or duplicate ${label}`);
};
const categories = rows['categories_demo.csv'];
const products = rows['products_demo.csv'];
const mappings = rows['category_mapping.csv'];
for (const key of ['category_id', 'root_categoryid', 'category_name']) unique(categories, key, `category ${key}`);
for (const key of ['product_id', 'source_item_id', 'sku']) unique(products, key, `product ${key}`);
unique(mappings, 'categoryid', 'source category ID');
const categoryBySeed = new Map(categories.map(category => [category.category_id, category]));
for (const c of categories) { integer(c.category_id, 'category ID', 1); integer(c.root_categoryid, 'root category ID', 1); }
for (const m of mappings) {
  integer(m.categoryid, 'source category ID', 0);
  const c = categoryBySeed.get(m.category_id);
  if (!c || c.root_categoryid !== m.root_categoryid || c.category_name !== m.category_name) throw Error('Invalid category mapping reference');
}
for (const p of products) {
  integer(p.product_id, 'product ID', 1); integer(p.source_item_id, 'source item ID', 1);
  integer(p.price, 'price', 1, Number.MAX_SAFE_INTEGER); integer(p.stock, 'stock', 0, 100);
  const interactions = integer(p.interactions, 'interactions', 1); const users = integer(p.users, 'users', 1);
  if (users > interactions || !['True', 'False'].includes(p.is_active) || !p.name.trim() || !p.brand.trim() || !p.description.trim() || p.name.length > 200 || p.description.length > 5000) throw Error('Invalid product content');
  const c = categoryBySeed.get(p.category_id);
  if (!c || c.category_name !== p.category_name) throw Error('Invalid product category');
  const url = new URL(p.image_url);
  if (url.protocol !== 'https:' || url.hostname !== 'placehold.co' || url.pathname !== '/600x600') throw Error('Unsupported demo image URL');
}
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbUrl.hostname)) throw Error('Demo import requires a local PostgreSQL database');
const lock = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
const prisma = new PrismaService();
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, ch => ch === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
try {
  await lock.connect();
  const locked = await lock.query('SELECT pg_try_advisory_lock($1, $2) AS acquired', [1314416722, 1]);
  if (!locked.rows[0].acquired) throw Error('Another catalog import is running');
  const dataset = await prisma.catalogDataset.findUnique({ where: { version: manifest.version } });
  if (dataset && dataset.checksum !== datasetChecksum) throw Error('Dataset version has a different checksum');
  if (dataset) {
    const existing = await prisma.product.findMany({ where: { seedDatasetId: dataset.id }, select: { seedProductId: true, retailrocketItemId: true, seedSku: true } });
    const source = new Map(products.map(p => [Number(p.product_id), p]));
    if (existing.some(p => !source.has(p.seedProductId) || source.get(p.seedProductId).source_item_id !== p.retailrocketItemId || source.get(p.seedProductId).sku !== p.seedSku)) throw Error('Existing product provenance conflicts with the artifact');
    if (existing.length === products.length) {
      const [categoryCount, mappingCount] = await Promise.all([prisma.category.count({ where: { seedDatasetId: dataset.id } }), prisma.catalogCategoryMapping.count({ where: { datasetId: dataset.id } })]);
      if (categoryCount !== categories.length || mappingCount !== mappings.length) throw Error('Existing catalog dataset is incomplete');
      console.log('Catalog already imported; existing admin changes were preserved.');
      process.exitCode = 0;
    } else if (existing.length) throw Error('Existing catalog dataset is incomplete; manual reconciliation is required');
  }
  const complete = dataset && await prisma.product.count({ where: { seedDatasetId: dataset.id } }) === products.length;
  if (!complete) {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN', status: 'ACTIVE' }, orderBy: { id: 'asc' } });
    if (!admin) throw Error('An active local Admin is required; configure demo credentials and run npm run seed:demo');
    await mkdir(assetDir, { recursive: true });
    const images = new Map();
    for (const category of categories) {
      const sample = products.find(p => p.category_id === category.category_id);
      if (!sample || products.some(p => p.category_id === category.category_id && p.image_url !== sample.image_url)) throw Error('Expected one demo image URL per category');
      const url = new URL(sample.image_url); url.pathname += '.png';
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw Error(`Cannot fetch PNG for category ${category.category_id}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw Error('Invalid PNG image');
      const fileName = `${sha(bytes)}.png`;
      const file = path.join(assetDir, fileName);
      try { await writeFile(file, bytes, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST' || sha(await readFile(file)) !== sha(bytes)) throw error; }
      images.set(category.category_id, { fileName, length: bytes.length });
    }
    const result = await prisma.$transaction(async tx => {
      const ds = dataset ?? await tx.catalogDataset.create({ data: { version: manifest.version, checksum: datasetChecksum } });
      const savedCategories = new Map();
      for (const c of categories) {
        const nameKey = c.category_name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
        const slug = normalize(c.category_name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const existing = await tx.category.findFirst({ where: { OR: [{ nameKey }, { slug }] } });
        if (existing) throw Error(`Category conflict for seed ID ${c.category_id}`);
        const category = await tx.category.create({ data: { name: c.category_name, nameKey, slug, seedDatasetId: ds.id, seedCategoryId: Number(c.category_id), seedRootCategoryId: c.root_categoryid } });
        savedCategories.set(c.category_id, category.id);
      }
      await tx.catalogCategoryMapping.createMany({ data: mappings.map(m => ({ datasetId: ds.id, sourceCategoryId: m.categoryid, rootCategoryId: m.root_categoryid, categoryId: savedCategories.get(m.category_id) })) });
      const assetIds = new Map();
      for (const [categoryId, image] of images) {
        const objectPath = `demo-catalog/${image.fileName}`;
        let asset = await tx.imageAsset.findUnique({ where: { bucket_objectPath: { bucket: 'demo-local', objectPath } } });
        if (!asset) asset = await tx.imageAsset.create({ data: { uploadedById: admin.id, bucket: 'demo-local', objectPath, contentType: 'image/png', contentLength: image.length, publicUrl: `/${objectPath}` } });
        assetIds.set(categoryId, asset.id);
      }
      for (const p of products) {
        const product = await tx.product.create({ data: { name: p.name, nameKey: normalize(p.name), description: p.description, categoryId: savedCategories.get(p.category_id), status: p.is_active === 'True' ? 'ACTIVE' : 'INACTIVE', optionConfig: {}, retailrocketItemId: p.source_item_id, seedDatasetId: ds.id, seedProductId: Number(p.product_id), seedSku: p.sku, seedCategoryId: Number(p.category_id), seedBrand: p.brand, sourceInteractions: Number(p.interactions), sourceUsers: Number(p.users) } });
        const variant = await tx.productVariant.create({ data: { productId: product.id, sku: `T-${randomUUID()}`, options: {}, priceVnd: BigInt(p.price), inventory: { create: { onHand: Number(p.stock), reserved: 0 } } } });
        await tx.productVariant.update({ where: { id: variant.id }, data: { sku: `SKU-${variant.id.toString().padStart(10, '0')}` } });
        await tx.productImage.create({ data: { productId: product.id, imageAssetId: assetIds.get(p.category_id), altText: p.name, isPrimary: true } });
      }
      return { products: products.length, categories: categories.length, mappings: mappings.length };
    }, { maxWait: 5000, timeout: 120000 });
    console.log('Imported catalog:', JSON.stringify(result));
  }
} finally {
  await prisma.$disconnect();
  await lock.end();
}
