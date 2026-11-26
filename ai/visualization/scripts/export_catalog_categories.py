"""Read-only export of actual DB category labels; never modifies PostgreSQL."""
import csv
import io
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
graph = json.loads((root / 'public/data/graph.json').read_text())
run_id = graph['model']['runId']
if run_id != 'catalog500_C_weighted128_cc481ffd50a5':
    raise SystemExit('Wrong graph model')
ids = {str(n['sourceId']) for n in graph['nodes'] if n['type'] == 'item'}
sql = '''SELECT p.id::text AS "productId", p.retailrocket_item_id AS "sourceId", p.name, c.name AS category
FROM products p JOIN categories c ON p.category_id = c.id
WHERE p.retailrocket_item_id IS NOT NULL ORDER BY p.id;'''
result = subprocess.run(['docker','exec','nexora-postgres-1','sh','-c',
    'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}" --csv -c "$1"', 'sh', sql],
    capture_output=True, text=True, check=True)
rows = [r for r in csv.DictReader(io.StringIO(result.stdout)) if r['sourceId'] in ids]
if len(ids) != 500 or len(rows) != len(ids) or len({r['sourceId'] for r in rows}) != len(ids):
    raise SystemExit('DB and graph item mapping do not match')
static_text = (root / 'src/catalog500-map.ts').read_text()
static_map = dict(re.findall(r'"(\d+)":\s*"(\d+)"', static_text))
if static_map != {r['productId']: r['sourceId'] for r in rows}:
    raise SystemExit('DB mapping differs from LIVE static mapping; fix mapping before use')
path = root / 'public/data/catalog500-categories.json'
path.write_text(json.dumps({'runId': run_id, 'items': rows}, ensure_ascii=False, indent=2))
print(f'PASS: {len(rows)} items / {len({r["category"] for r in rows})} categories; {path}')
