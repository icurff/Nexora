import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const manifest = JSON.parse(await readFile(new URL('./real-catalog.json', import.meta.url), 'utf8'));
const assets = fileURLToPath(new URL('../../frontend/public/real-catalog/', import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const normalized = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, (c) => c === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
const dbUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(dbUrl.hostname)) throw Error('Real catalog seed requires local PostgreSQL');
if (manifest.products.length !== 500 || new Set(manifest.products.map((p) => p.seedProductId)).size !== 500) throw Error('Invalid catalog manifest');

await mkdir(assets, { recursive: true });
for (const p of manifest.products) {
  const match = /^([a-f0-9]{64})\.(jpg|png)$/.exec(p.imageFile);
  const url = new URL(p.imageUrl);
  if (!match || url.protocol !== 'https:' || !['m.media-amazon.com', 'images-na.ssl-images-amazon.com'].includes(url.hostname)
      || !p.name || p.name.length > 200 || !p.description || p.description.length > 5000) throw Error(`Invalid manifest entry ${p.seedProductId}`);
  const file = path.join(assets, p.imageFile);
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Image download failed for ${p.seedProductId}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== p.imageLength || hash(bytes) !== match[1]) throw Error(`Image checksum mismatch for ${p.seedProductId}`);
    await writeFile(file, bytes, { flag: 'wx' });
  }
  if (bytes.length !== p.imageLength || hash(bytes) !== match[1]) throw Error(`Invalid local image for ${p.seedProductId}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [1314416722, 1]);
  const ds = await client.query('SELECT id FROM catalog_datasets WHERE version = $1', ['retailrocket-demo-v1']);
  if (ds.rowCount !== 1) throw Error('Run npm run seed:catalog first');
  const admin = await client.query("SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id LIMIT 1");
  if (!admin.rowCount) throw Error('An active Admin is required');
  let changed = 0, skipped = 0, already = 0;
  for (const p of manifest.products) {
    const result = await client.query(`SELECT p.id, p.name, p.description, p.seed_brand, p.seed_category_id,
      p.retailrocket_item_id, c.seed_category_id AS current_category_id, c.seed_dataset_id AS current_category_dataset,
      pi.id AS image_id, pi.is_primary, pi.variant_id, ia.bucket, ia.object_path
      FROM products p JOIN categories c ON c.id = p.category_id LEFT JOIN product_images pi ON pi.product_id = p.id
      LEFT JOIN image_assets ia ON ia.id = pi.image_asset_id
      WHERE p.seed_dataset_id = $1 AND p.seed_product_id = $2 FOR UPDATE OF p`, [ds.rows[0].id, p.seedProductId]);
    if (!result.rowCount) throw Error(`Missing seed product ${p.seedProductId}`);
    const current = result.rows[0];
    if (current.retailrocket_item_id !== p.retailrocketItemId || current.seed_category_id !== p.seedCategoryId) throw Error(`Provenance mismatch for ${p.seedProductId}`);
    const objectPath = `real-catalog/${p.imageFile}`;
    if (result.rowCount === 1 && current.name === p.name && current.description === p.description
        && current.bucket === 'demo-local' && current.object_path === objectPath) { already++; continue; }
    if (result.rowCount !== 1 || current.current_category_id !== p.seedCategoryId || current.current_category_dataset !== ds.rows[0].id
        || !current.is_primary || current.variant_id !== null || current.name !== p.expectedName || current.description !== p.expectedDescription
        || current.seed_brand !== p.expectedBrand || current.bucket !== 'demo-local' || !current.object_path?.startsWith('demo-catalog/')) { skipped++; continue; }
    const asset = await client.query(`INSERT INTO image_assets (uploaded_by_id, bucket, object_path, content_type, content_length, public_url)
      VALUES ($1, 'demo-local', $2, $3, $4, $5)
      ON CONFLICT (bucket, object_path) DO UPDATE SET object_path = EXCLUDED.object_path RETURNING id`,
    [admin.rows[0].id, objectPath, p.imageType, p.imageLength, `/${objectPath}`]);
    await client.query('UPDATE products SET name=$1, name_key=$2, description=$3, seed_brand=$4, updated_at=NOW() WHERE id=$5',
      [p.name, normalized(p.name), p.description, p.brand, current.id]);
    await client.query('UPDATE product_images SET image_asset_id=$1, alt_text=$2 WHERE id=$3', [asset.rows[0].id, p.name, current.image_id]);
    changed++;
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ changed, already, skipped }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
