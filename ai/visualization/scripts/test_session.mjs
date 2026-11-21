import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { itemId, sessionPayload, recommendSession } from '../src/session.ts';

const data = JSON.parse(
  await readFile(new URL('../public/data/graph.json', import.meta.url)),
);
const items = data.nodes.filter((n) => n.type === 'item');
const nativeFetch = globalThis.fetch;
globalThis.fetch = (path, options) =>
  nativeFetch(new URL(path, 'http://127.0.0.1:5174'), options);

test('safe IDs, ordered/repeated histories and 200-event boundary', () => {
  assert.equal(itemId('506'), 506);
  for (const id of ['-1', '1.2', '9007199254740992', 'hello', ''])
    assert.throws(() => itemId(id));
  const history = [items[0].sourceId, items[1].sourceId, items[0].sourceId];
  const payload = sessionPayload(history, items);
  assert.deepEqual(payload.recent_itemids, history.map(Number));
  assert.deepEqual(
    payload.candidate_itemids,
    items.map((n) => Number(n.sourceId)),
  );
  assert.equal(
    sessionPayload(Array(200).fill(history[0]), items).recent_itemids.length,
    200,
  );
  assert.throws(() => sessionPayload(Array(201).fill(history[0]), items));
});

test('real proxy and client agree with existing AI serving policy/ranking/evidence', async () => {
  const history = [
    items[0].sourceId,
    items[1].sourceId,
    items[0].sourceId,
    items[2].sourceId,
  ];
  const result = await recommendSession(
    history,
    items,
    AbortSignal.timeout(15000),
  );
  const direct = await nativeFetch('http://127.0.0.1:8000/recommend/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionPayload(history, items)),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(direct.status, 200);
  const actual = await direct.json();
  assert.equal(result.strategy, 'cold_session_hybrid');
  assert.equal(result.items.length, 5);
  assert.deepEqual(
    result.items.map((n) => [n.sourceId, n.score, n.reason]),
    actual.items.map((n) => [
      String(n.retailrocket_itemid),
      n.score,
      n.reason_code,
    ]),
  );
  for (const n of result.items) {
    assert.ok(!history.includes(n.sourceId));
    assert.ok(items.some((item) => item.sourceId === n.sourceId));
    const evidence = actual.items.find(
      (item) => String(item.retailrocket_itemid) === n.sourceId,
    ).evidence;
    if (n.reason === 'SIMILAR_TO_RECENT_VIEW') {
      assert.equal(n.recentSourceId, String(evidence.recent_source_item_id));
      assert.equal(n.cosine, evidence.cosine_similarity);
    } else assert.equal(n.popularity, evidence.train_user_count);
  }
});

test('unknown and empty histories return no fabricated recommendations', async () => {
  for (const history of [[], ['9007199254740991']]) {
    const result = await recommendSession(
      history,
      items,
      AbortSignal.timeout(15000),
    );
    assert.equal(result.strategy, 'no_known_session_items');
    assert.deepEqual(result.items, []);
  }
});

test('all sampled candidates already viewed yields no eligible candidates', async () => {
  const candidate = [items[0]];
  const result = await recommendSession(
    [items[0].sourceId],
    candidate,
    AbortSignal.timeout(15000),
  );
  assert.equal(result.strategy, 'no_eligible_candidates');
  assert.deepEqual(result.items, []);
});

test('cancelled requests do not produce recommendations', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => recommendSession([items[0].sourceId], items, controller.signal),
    { name: 'AbortError' },
  );
});
