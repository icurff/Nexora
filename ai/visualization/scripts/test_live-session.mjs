import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLive, liveNodes, readLiveSession } from '../src/live-session.ts';

test('empty or existing session with no new views has no drawn product nodes', () => {
  assert.deepEqual(liveNodes(emptyLive), []);
  assert.deepEqual(
    liveNodes({
      ...emptyLive,
      session: { id: '20', startedAt: new Date().toISOString() },
    }),
    [],
  );
});
test('real product identities remain distinct, repeated VIEW does not duplicate nodes, missing mapping is explicit', () => {
  const now = new Date().toISOString();
  const snapshot = {
    session: { id: '9007199254740993', startedAt: now },
    truncated: false,
    events: [
      {
        eventId: '1',
        occurredAt: now,
        receivedAt: now,
        product: {
          id: '9007199254740993',
          name: 'Product one',
          retailrocketItemId: '506',
        },
      },
      {
        eventId: '2',
        occurredAt: now,
        receivedAt: now,
        product: { id: '2', name: 'Product two', retailrocketItemId: null },
      },
      {
        eventId: '3',
        occurredAt: now,
        receivedAt: now,
        product: {
          id: '9007199254740993',
          name: 'Product one',
          retailrocketItemId: '506',
        },
      },
    ],
  };
  const nodes = liveNodes(snapshot);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].key, 'product:9007199254740993');
  assert.equal(nodes[0].sourceId, '506');
  assert.equal(nodes[1].sourceId, '');
  assert.equal(nodes[0].productId, '9007199254740993');
  assert.equal(nodes[0].name, 'Product one');
  for (const n of nodes) {
    assert.equal(n.layout, 'schematic');
    assert.equal(n.vector.length, 0);
    assert.equal(n.trainDegree, null);
    assert.ok(n.position.every(Number.isFinite));
  }
  assert.deepEqual(liveNodes(snapshot), nodes);
});
test('live endpoint is read-only and empty for missing or invalid cookie, rejects invalid or identity-selecting queries', async () => {
  const base = 'http://127.0.0.1:5174';
  const since = new Date().toISOString();
  for (const cookie of ['', 'nexora_visitor=invalid']) {
    const res = await fetch(
      `${base}/api/v1/tracking/session-graph?since=${encodeURIComponent(since)}`,
      { headers: cookie ? { Cookie: cookie } : {} },
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('set-cookie'), null);
    assert.deepEqual(await res.json(), emptyLive);
  }
  for (const query of [
    'since=bad',
    `since=${encodeURIComponent(since)}&visitorId=20`,
    `since=${encodeURIComponent(since)}&sessionId=20`,
  ]) {
    const res = await fetch(`${base}/api/v1/tracking/session-graph?${query}`);
    assert.equal(res.status, 400);
  }
  const native = globalThis.fetch;
  globalThis.fetch = (url, init) => native(new URL(url, base), init);
  try {
    assert.deepEqual(
      await readLiveSession(since, AbortSignal.timeout(5000)),
      emptyLive,
    );
  } finally {
    globalThis.fetch = native;
  }
});

test('catalog background does not create observed items and toggling preserves positions/mapping', () => {
  const now = new Date().toISOString();
  const snapshot = {
    session: { id: '21', startedAt: now },
    truncated: false,
    events: [
      {
        eventId: 'view',
        occurredAt: now,
        receivedAt: now,
        product: {
          id: '496',
          name: 'Viewed product',
          retailrocketItemId: '403562',
        },
      },
    ],
  };
  const catalog = [
    { id: '1', name: 'Unseen' },
    { id: '496', name: 'Viewed product' },
  ];
  const before = liveNodes(snapshot);
  const after = liveNodes(snapshot, catalog);
  assert.equal(after.length, 2);
  const viewed = after.find((n) => n.productId === '496');
  assert.deepEqual(viewed.position, before[0].position);
  assert.equal(viewed.sourceId, '403562');
  assert.equal(viewed.observed, true);
  const unseen = after.find((n) => n.productId === '1');
  assert.equal(unseen.observed, false);
  assert.equal(unseen.mappingUnknown, true);
  assert.equal(
    liveNodes(emptyLive, catalog).filter((n) => n.observed).length,
    0,
  );
  assert.deepEqual(liveNodes(snapshot), before);
});

test('catalog reader loads every real public page through the proxy without duplicate products', async () => {
  const { readCatalog } = await import('../src/live-session.ts');
  const native = globalThis.fetch;
  globalThis.fetch = (url, init) =>
    native(new URL(url, 'http://127.0.0.1:5174'), init);
  try {
    const catalog = await readCatalog(AbortSignal.timeout(20000));
    const response = await native(
      'http://127.0.0.1:3000/api/v1/products?page=1&pageSize=100',
    );
    const page = await response.json();
    assert.equal(catalog.length, page.total);
    assert.equal(new Set(catalog.map((n) => n.id)).size, catalog.length);
    for (const product of page.items)
      assert.ok(
        catalog.some((n) => n.id === product.id && n.name === product.name),
      );
  } finally {
    globalThis.fetch = native;
  }
});

test('recommendation nodes preserve AI/rule provenance without becoming observed VIEWs', () => {
  const now = new Date().toISOString();
  const snapshot = {
    ...emptyLive,
    session: { id: '30', startedAt: now },
    recommendation: {
      id: 'rec-1',
      generatedAt: now,
      surface: 'detail',
      items: [
        {
          product: { id: '1', name: 'AI product', retailrocketItemId: '506' },
          source: 'lightgcn_session',
          reason: 'SIMILAR_TO_RECENT_VIEW',
          score: 0.5,
        },
        {
          product: { id: '2', name: 'Rule product', retailrocketItemId: null },
          source: 'rule_based',
          reason: 'new_arrival',
        },
      ],
    },
  };
  const nodes = liveNodes(snapshot);
  assert.equal(nodes.length, 2);
  assert.equal(nodes.filter((n) => n.observed).length, 0);
  assert.deepEqual(
    nodes.map((n) => n.recommendationSource),
    ['lightgcn_session', 'rule_based'],
  );
  assert.equal(nodes[0].sourceId, '506');
  assert.equal(nodes[1].mappingUnknown, false);
  const withView = {
    ...snapshot,
    events: [
      {
        eventId: 'view',
        occurredAt: now,
        receivedAt: now,
        product: snapshot.recommendation.items[0].product,
      },
    ],
  };
  assert.equal(liveNodes(withView).length, 2);
  assert.equal(liveNodes(withView).filter((n) => n.observed).length, 1);
});

test('graph shows actual commerce API response, isolates other cookies and does not recompute recommendations when polled', async () => {
  const base = 'http://127.0.0.1:3000/api/v1';
  const since = new Date(Date.now() - 1000).toISOString();
  const res = await fetch(`${base}/recommendations/home?limit=5`);
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const response = await res.json();
  assert.ok(response.items.length);
  const url = `${base}/tracking/session-graph?since=${encodeURIComponent(since)}`;
  const snapshot = await (
    await fetch(url, { headers: { Cookie: cookie } })
  ).json();
  assert.deepEqual(snapshot.events, []);
  assert.equal(snapshot.recommendation.surface, 'home');
  assert.deepEqual(
    snapshot.recommendation.items.map((n) => [
      n.product.id,
      n.source,
      n.reason,
      n.score,
    ]),
    response.items.map((n) => [n.productId, n.source, n.reason, n.score]),
  );
  const repeated = await (
    await fetch(url, { headers: { Cookie: cookie } })
  ).json();
  assert.equal(repeated.recommendation.id, snapshot.recommendation.id);
  const isolated = await (await fetch(url)).json();
  assert.equal(isolated.recommendation, undefined);
  const reset = await (
    await fetch(
      `${base}/tracking/session-graph?since=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`,
      { headers: { Cookie: cookie } },
    )
  ).json();
  assert.equal(reset.recommendation, undefined);
});
