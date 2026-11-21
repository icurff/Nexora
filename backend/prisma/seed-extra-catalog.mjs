import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const manifestBytes = await readFile(new URL('./extra-catalog.json', import.meta.url));
const manifest = JSON.parse(manifestBytes);
const checksum = (bytes) => createHash('sha256').update(bytes).digest('hex');
const assets = fileURLToPath(new URL('../../frontend/public/real-catalog/', import.meta.url));
const normalized = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, (c) => c === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbUrl.hostname)) throw Error('Extra catalog seed requires local PostgreSQL');
if (manifest.version !== 'amazon-extra-catalog-v1' || manifest.products.length !== 753
    || new Set(manifest.products.map((p) => p.seedProductId)).size !== manifest.products.length
    || new Set(manifest.products.map((p) => p.sourceAsin)).size !== manifest.products.length) throw Error('Invalid catalog manifest');

await mkdir(assets, { recursive: true });
for (const p of manifest.products) {
  const match = /^([a-f0-9]{64})\.(jpg|png)$/.exec(p.imageFile);
  const url = new URL(p.imageUrl);
  if (!match || url.protocol !== 'https:' || !['m.media-amazon.com', 'images-na.ssl-images-amazon.com'].includes(url.hostname)
      || !/^[A-Z0-9]{10}$/.test(p.sourceAsin) || !Number.isInteger(p.seedProductId) || !Number.isInteger(p.seedCategoryId)
      || !p.name || p.name.length > 200 || !p.description || p.description.length > 5000
      || !Number.isSafeInteger(p.priceVnd) || p.priceVnd < 1 || !Number.isInteger(p.stock) || p.stock < 0
      || p.imageLength < 1000 || p.imageLength > 5242880 || !['image/jpeg', 'image/png'].includes(p.imageType)) throw Error(`Invalid manifest entry ${p.seedProductId}`);
  const file = path.join(assets, p.imageFile);
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Image download failed for ${p.seedProductId}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== p.imageLength || checksum(bytes) !== match[1]) throw Error(`Image checksum mismatch for ${p.seedProductId}`);
    await writeFile(file, bytes, { flag: 'wx' });
  }
  if (bytes.length !== p.imageLength || checksum(bytes) !== match[1]) throw Error(`Invalid local image for ${p.seedProductId}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1314416722, 1]);
  const existing = await client.query('SELECT id, checksum FROM catalog_datasets WHERE version=$1', [manifest.version]);
  if (existing.rowCount) {
    if (existing.rows[0].checksum !== checksum(manifestBytes)) throw Error('Catalog dataset checksum mismatch');
    const rows = await client.query('SELECT seed_product_id, seed_sku FROM products WHERE seed_dataset_id=$1', [existing.rows[0].id]);
    const source = new Map(manifest.products.map((p) => [p.seedProductId, `AMZ-${p.sourceAsin}`]));
    if (rows.rowCount !== manifest.products.length || rows.rows.some((p) => source.get(p.seed_product_id) !== p.seed_sku)) throw Error('Existing extra catalog is incomplete or has conflicting provenance');
    await client.query('COMMIT');
    console.log(JSON.stringify({ created: 0, already: rows.rowCount }));
  } else {
    const base = await client.query('SELECT id FROM catalog_datasets WHERE version=$1', ['retailrocket-demo-v1']);
    if (base.rowCount !== 1) throw Error('Run npm run seed:catalog first');
    const categories = await client.query('SELECT id, seed_category_id FROM categories WHERE seed_dataset_id=$1 AND is_active=true', [base.rows[0].id]);
    const categoryIds = new Map(categories.rows.map((c) => [c.seed_category_id, c.id]));
    if (manifest.products.some((p) => !categoryIds.has(p.seedCategoryId))) throw Error('Required catalog category is missing or inactive');
    const admin = await client.query("SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE' ORDER BY id LIMIT 1");
    if (!admin.rowCount) throw Error('An active Admin is required');
    const names = manifest.products.map((p) => normalized(p.name));
    if (new Set(names).size !== names.length) throw Error('Duplicate product name in manifest');
    const conflicts = await client.query('SELECT name FROM products WHERE name_key=ANY($1::text[]) LIMIT 1', [names]);
    if (conflicts.rowCount) throw Error(`A product with this name already exists: ${conflicts.rows[0].name}`);
    const ds = await client.query('INSERT INTO catalog_datasets (version, checksum) VALUES ($1,$2) RETURNING id', [manifest.version, checksum(manifestBytes)]);
    for (const p of manifest.products) {
      const objectPath = `real-catalog/${p.imageFile}`;
      const asset = await client.query(`INSERT INTO image_assets (uploaded_by_id, bucket, object_path, content_type, content_length, public_url)
        VALUES ($1, 'demo-local', $2, $3, $4, $5)
        ON CONFLICT (bucket, object_path) DO UPDATE SET object_path=EXCLUDED.object_path RETURNING id`,
      [admin.rows[0].id, objectPath, p.imageType, p.imageLength, `/${objectPath}`]);
      const product = await client.query(`INSERT INTO products (name, name_key, description, category_id, status, option_config, price_vnd,
        seed_dataset_id, seed_product_id, seed_sku, seed_category_id, seed_brand)
        VALUES ($1,$2,$3,$4,'ACTIVE','{}'::jsonb,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.name, normalized(p.name), p.description, categoryIds.get(p.seedCategoryId), p.priceVnd,
        ds.rows[0].id, p.seedProductId, `AMZ-${p.sourceAsin}`, p.seedCategoryId, p.brand]);
      await client.query('INSERT INTO product_inventory (product_id, on_hand, reserved) VALUES ($1,$2,0)', [product.rows[0].id, p.stock]);
      await client.query('INSERT INTO product_images (product_id, image_asset_id, alt_text, is_primary) VALUES ($1,$2,$3,true)', [product.rows[0].id, asset.rows[0].id, p.name]);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ created: manifest.products.length, already: 0 }));
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
