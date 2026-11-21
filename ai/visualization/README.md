# Nexora AI Graph Explorer

Independent, local-only React / TypeScript / Vite / Three.js app. It reads actual
LightGCN serving embeddings and an optional **checkpoint-verified training
adjacency**. The cold-start mode reads the current browser's persisted LIVE tracking through a read-only backend API.
It does not modify commerce frontend/backend, training, serving, application
secrets, or source datasets. It uses local system fonts.

## Run locally

Use Node 24 / npm 11. From the repository root:

```bash
cd ai/visualization
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/export_data.py
.venv/bin/python scripts/export_projector.py
npm ci
npm run dev
```

Open <http://127.0.0.1:5174>. The loopback-only port is strict, allowing Nexora
frontend (5173), backend (3000), and AI serving to run independently. After setup,
`npm run dev` is enough. Export again when inputs/sample change. Production:
`npm run build`, then `npm run preview` (same port). Generate data before building;
Vite copies `public/` into the static build.

## Verified real training graph

The first checkout contained no adjacency, only references/checksums in
`best.pt`. Subsequently, the actual clean RetailRocket data and Task 073 notebook
were found outside the repository:

- `~/Documents/Users/DACN2/dataset/data_clean_parquet.zip`
- `~/Documents/Users/DACN2/DACN_2_3_Temporal_Split.ipynb`
- Training notebook: `DACN_2_4_v2_Train_LightGCN_Optimized.ipynb` in that directory.

`recover_training_graph.py` reproduces the inspected Task 073 graph preparation:
validate/deduplicate real events; global chronological 80/10/10 split without
straddling timestamps; train-only user/item cohort; sorted index mappings; unique
User–Item aggregation with event weights view=1, addtocart=3, transaction=5; binary
CSR and `log1p(sum weights)` weighted CSR. **It does not train a model.**

Recovery yielded 43,583 users, 20,000 items, and **291,109 distinct training
pairs**. Both adjacency files match the original checkpoint's SHA-256 exactly:

| File                 | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `train_binary.npz`   | `a46b9aaa4ee38b08a78f66c242fe9202acb5924077dc615585e200d08d5e8bc2` |
| `train_weighted.npz` | `ef451d39dfaa17596935b95835bf1c5d3e1f21249dcd3902cc21431d6c04e381` |

Recovered mapping DataFrames also match the existing mappings exactly, and those
source Parquet hashes match serving and checkpoint metadata. Regenerated Parquet
serialization produced a different byte hash, so no regenerated edge Parquet is
used as evidence. The exact NPZ hashes above establish the graph match.

To reproduce recovery before exporting (only needed if adjacency is missing):

```bash
.venv/bin/python scripts/recover_training_graph.py \
  --events /home/khanh/Documents/Users/DACN2/dataset/data_clean_parquet.zip
.venv/bin/python scripts/export_data.py
.venv/bin/python scripts/export_projector.py
```

`--events` also accepts an extracted `events_clean.parquet`. Recovery writes only
ignored `ai/data/processed/visualization_recovery/` outputs and a manifest of source
hashes, versions, split boundaries and counts. Both graph hashes must match before
recovered files are made available. Different preprocessing/numerical versions
may fail exact checks; obtain the original Task 073 NPZs rather than bypassing
validation. Source files and model weights are never overwritten.

## Model inputs and provenance

Required inputs default to `ai/artifacts/lightgcn_v2/`:

| File                              | Purpose                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `selected_user_embeddings.npy`    | 43,583 retained User vectors, 64D                              |
| `selected_item_embeddings.npy`    | 20,000 retained Item vectors, 64D                              |
| `user_mapping.parquet`            | `user_idx` → RetailRocket `visitorid`                          |
| `item_mapping.parquet`            | `item_idx` → RetailRocket `itemid`                             |
| `popularity_scores.npy`           | Raw nonnegative popularity, indexed by item row                |
| `selected_model_for_serving.json` | Selected family, seed, run and mapping hashes                  |
| `best.pt`                         | Checkpoint metadata/config, training source hashes, best epoch |

Family `LightGCN_WeightedSampling`, run
`final_LightGCN_WeightedSampling_d64_L2_s2026_9462ba44d610`: 64D, 2 layers,
seed 2026, best epoch 80, `sqrt_weight` positive sampling, learning rate 0.003,
L2 regularization 0.0001. A restricted pickle reader extracts metadata, discards
checkpoint tensor storage and rejects unknown layouts/globals; no PyTorch needed.
No per-layer embedding arrays are available or claimed.

The exporter validates finiteness, dimensions, index coverage, unique IDs, mapping
hashes against both metadata sources, and adjacency hash against checkpoint. IDs
remain decimal strings, indexed by mapping rows rather than Parquet row order.
`graph.json` schema v2 records source hashes, PCA parameters, model metadata and
separate arrays for cosine and observed train pairs.

## Modes, transformations and sampling

- **Training interactions:** only pairs from verified `train_binary.npz`; no
  inferred links. Both endpoints must occur in the displayed sample. Current
  default: **180 observed edges**, from the full 291,109-pair train graph. Node
  positions still use PCA of serving embeddings, not a force layout or an
  animation of training. The inspector shows full-graph node degree separately.
- **Cold-start session (LIVE):** initially empty. As the customer opens actual
  Nexora product details, existing website tracking persists VIEW events in
  PostgreSQL. The graph polls the current browser's active session and draws a
  purple session node with green edges to the actual viewed products. It does
  not create simulated views. Layout is schematic, not PCA. Recommendations
  continue to run in the full commerce website, not as inferred VIEW edges.

The former cosine mode button was removed. Its existing exported cosine data is
retained for reproducible research/export compatibility, but is not rendered in
either of the two current UI modes.

PCA fits **all 63,583 raw retained vectors together**, centered in float64,
using the 64 × 64 covariance eigendecomposition. No normalization precedes PCA.
Largest-absolute loading is made positive per eigenvector for sign consistency.
One uniform display scale uses the maximum full-data projected radius → 90;
no per-axis distortion or outlier removal. Only coordinates are rounded to six
decimals; exported embedding values retain full float64 serialization precision.

Default sample: 600 users then 900 items, NumPy `default_rng(2026)`, sampling
without replacement and sorting indices. These sampling/PCA settings apply only to the training graph. LIVE mode uses
actual Nexora Product IDs from DB, without restricting them to the embedding
sample. All LIVE positions are explicitly schematic: neither learned embeddings
nor a PCA projection. Unmapped products are still shown and labelled accordingly. Model seed and visualization
sample seed are separate concepts. Bounds: 1–2,000 nodes per type, at most 6,000
cosine edges, at most 20,000 observed edges (lexicographically first pairs if
truncated). Available induced-edge totals and exported counts are shown separately.
The current graph export is about 2.4 MB. Custom sample/inputs:

```bash
.venv/bin/python scripts/export_data.py --users 400 --items 600 --seed 2026
.venv/bin/python scripts/export_data.py --training-graph /path/to/train_binary.npz
.venv/bin/python scripts/export_data.py --embedding-only
```

Without an explicit adjacency path, it checks `train_binary.npz` in the artifact
root, then the recovered directory. A found but invalid file fails; it never
silently replaces it with fabricated edges. Without any adjacency, only embedding
mode is available. `--embedding-only` explicitly omits train data.

## TensorFlow Projector option

To use the existing [Embedding Projector](https://projector.tensorflow.org/):

```bash
.venv/bin/python scripts/export_projector.py
```

Use **Load** to select `public/projector/vectors.tsv` for vectors and
`public/projector/metadata.tsv` for metadata. Select the 3D PCA view, label by
`label`, color by `type`, and search by RetailRocket ID. Those two files have
identical row order: vectors have 1,500 rows × 64 original dimensions, no header;
metadata has one header row followed by exactly 1,500 labels. Source IDs,
embedding indices, full train degrees and popularity are preserved. The manifest
records the input graph hash, sample and source hashes. Re-export these after
changing `graph.json`.

Projector computes its own projections; coordinates need not match this app's
PCA fit on the full 63,583-node dataset. The TSVs contain embeddings/labels, not
training adjacency; Projector nearest-neighbor views should not be interpreted
as the recorded interaction graph. The standalone app has separate train and
cold-start modes.

## Limitations and demo

PCA retains **16.31%** variance in the current three axes. Visual proximity is
approximate; cosine uses the full vectors. Retained totals are not the entire
RetailRocket dataset or active Nexora accounts/catalog; IDs belong to RetailRocket.
Training edges aggregate views/cart/purchases into unique pairs. Binary adjacency
does not distinguish the event type, frequency or timestamp. Sparse random
sampling leaves isolated displayed nodes even when they have full-graph neighbors.

Popularity is the original `.npy` value. If it matches verified binary item degrees,
the app states that; otherwise it keeps the raw value without assuming count
semantics. Sizes/colors do not encode popularity. Checkpoint tensor weights alone
are not layer propagation output. This demo uses serving exports and does not
independently recompute the layer aggregation. Auto-rotation moves the camera;
no propagation animation is shown. Reduced-motion preferences disable it initially.

Demo: read totals/sample → choose **Tương tác train** → search `user:554` and
select User 17947 to see one sampled train neighbor (Item 38965), versus its full
train degree of 10. Drag to rotate, scroll to zoom, right-drag to pan. Filter node
types, inspect metadata/vectors and reset view. The global edge checkbox shows
all exported train pairs; selecting a node shows incident pairs even with it off.
Both endpoint types must be visible. Touch uses pinch/pan via OrbitControls.
WebGL 2 is required; failed rendering leaves the search/inspector usable.

## Cold-start session: real website → database → graph

The UI now has exactly two buttons: **Tương tác train** and **Phiên cold-start**.
Manual Item ID recording has been replaced by observing persisted website VIEWs.

1. Run the existing backend on 3000, the complete commerce frontend on 5173 and
   this graph on 5174. The backend must include the new read-only route. With the
   existing local configuration, run in separate terminals:

   ```bash
   cd backend
   npm run build
   node --env-file=.env dist/main.js
   ```

   ```bash
   cd frontend
   npm run dev -- --host 127.0.0.1
   ```

   ```bash
   cd ai/visualization
   npm run dev
   ```

   During verification, the old frontend Docker container's API proxy returned
   502 because backend was running on the host. The container
   `nexora-frontend-1` was stopped (not removed), and frontend was started locally
   on the same 5173 port using its existing host proxy. PostgreSQL was preserved.
   To return to a compatible Docker setup later, stop the local frontend before
   starting the container and ensure its backend target is reachable. No Docker
   config, frontend source, environment secrets, schema or seed data was changed.

2. Open the graph at `http://127.0.0.1:5174/`, choose **Phiên cold-start**. It starts
   with **0 nodes / 0 edges** and observes new VIEWs and recommendation responses. Click
   **Mở website Nexora đầy đủ** to open `http://127.0.0.1:5173/` in the same
   browser. Use the full existing shop, login, cart, search and product pages.
3. Click a product to open its detail. Its existing `trackEvent` call stores the
   VIEW in PostgreSQL. After the next poll (about 1.5 seconds), the graph draws
   the real tracking session and viewed product. Product names, Nexora IDs,
   RetailRocket mapping and VIEW receipt times are read from DB. Products do not
   need to occur in the 900-Item embedding sample. Click another product for an
   additional edge. Repeat views increase event count, not unique node count.
4. Both tabs must use the **same hostname and browser**. `localhost` and
   `127.0.0.1` have different cookies; use the provided button. Existing login
   and tracking are left intact. The graph's API lives under `/api/v1` so the
   existing HttpOnly visitor cookie's `/api/v1` path is honored across ports.
5. **Theo dõi từ bây giờ** clears only the display window, starting at the new
   timestamp. It does not erase events, rotate identity, or create a DB session.
   Switching to training mode and back preserves the same start timestamp and
   last confirmed snapshot; polling resumes and catches up on new VIEWs. Only
   the explicit reset button or a full page reload starts a new display window.
   The real tracking session remains subject to the existing 30-minute idle
   expiry and login/logout transitions. Reading the graph never refreshes it.
   For a strictly new cold-start DB identity, open both tabs in one fresh private
   browser window; clearing the graph alone does not clear prior website history.

`GET /api/v1/tracking/session-graph?since=<ISO8601>` reads only the active session
identified by the requesting browser's existing visitor cookie. It never accepts
visitor/session IDs from the caller. Missing/invalid/unknown cookies or expired
sessions return an empty result without writes or Set-Cookie. Results are
`Cache-Control: no-store`, scoped to visitor + active session + `dataOrigin=LIVE`

- `eventType=view`, bounded to the latest 200 events, ordered chronologically.
  Truncation is explicit. No account names, contact information, cookie tokens or
  visitor IDs are returned. Session/Product bigint IDs remain decimal strings.

`TrackingGraphRepository` performs the scoped Prisma reads and
`TrackingController` validates the timestamp and exposes the route. No schema
migration or write path was added. Vite dev/preview proxies this specific read
route to backend:3000. There is no open list-all-sessions endpoint. Failed polls
show an error and retain the last confirmed snapshot until the service recovers.
Polling does not invoke AI. Session-aware recommendation routes copy their actual
responses to a bounded transient store; graph reads those responses with separate
edge semantics. Ranking and existing website recommendations are unchanged.
The prior direct AI session helper/tests are retained for contract verification,
but are not used by the LIVE-mode UI.

The LIVE session node is a **schematic marker** for a real tracking session, not
a newly trained User embedding. Product nodes are also arranged schematically;
no embedding, train weight or model score is invented for them. The panel and
legend disclose this distinction. The training-mode PCA remains unchanged.

Verified browser flow: empty graph → open website → click Product 496
(RetailRocket 403562) → session #20 and one edge → click Product 284
(RetailRocket 354233) → same session, three nodes and two edges. These were
actual product-page visits persisted by the existing tracking code, not injected
mock events. Existing LightGCN recommendations also appeared in the storefront.

Generated JSON/TSVs, recovered graph binaries, `.venv`, dependencies and builds
are ignored. Do not commit original/recovered data or weights. Generated output
contains source IDs and embedding values; Vite copies these into `dist/`. This
work is local-only. It does not publish or upload data.

## Validation

```bash
npm run typecheck
npm run lint
npm run build
.venv/bin/python scripts/test_export.py
# Requires this app on 5174 and the existing AI service on 8000:
node --test scripts/test_session.mjs
# Real backend/proxy read checks and live layout identity tests:
node --test scripts/test_live-session.mjs
```

Tests check deterministic export, mapping/vector/popularity fidelity, PCA,
cosine/dot/top-k, invalid/missing input errors, exact induced training edges,
full graph degrees, checksum/shape rejection without overwriting the prior
asset, and Projector vector/metadata row alignment. The real-data tests require
local artifacts; interaction tests explicitly skip if recovery is absent.
Vite may issue a >500 kB chunk size advisory for Three.js; builds still pass.

Session tests verify safe numeric serialization and the 200-event bound,
ordered/repeated history, exact ranking/scores/evidence parity against the real
AI service through the proxy, unknown/empty histories, excluded candidates and
request cancellation. These tests are read-only inference calls. No mocks stand
in for real integration.

Backend validation: typecheck/lint/build, existing tests, and
`npx vitest run src/tracking/tracking-graph.repository.spec.ts`. New repository
tests cover missing/invalid identity, expiration, ownership/session scoping,
chronological truncation and bigint serialization. LIVE client tests verify no
nodes without VIEWs or recommendations, correct Product-vs-source identity, deduplication, unmapped
items, no-cookie/invalid-cookie HTTP behavior, no Set-Cookie, no-store and rejected
identity-selecting query parameters. Browser verification covers the actual
commerce → PostgreSQL → graph flow.

### Show all public products in LIVE mode

The graph toolbar has **Hiện tất cả sản phẩm / Chỉ hiện đã xem**. The default
shows confirmed viewed and recommended products. Enabling the button reads every page
of the existing public `GET /api/v1/products` catalog (100 per page, five requests
at a time; currently 500 products). It does not send tracking events or alter the
active session/window. Disabling restores the viewed/recommended graph.

Unviewed catalog products are gray; products with a persisted VIEW in the display
window are green. Only confirmed VIEW products enter `session.historyKeys`, so
showing the catalog never fabricates session edges or a session node without a
VIEW or recommendation response. Clicking a graph point only inspects it. The fixed schematic position
is derived from Product ID and remains the same across toggles. Existing viewed
products are retained even if no longer in the public catalog. Catalog data is
cached until page reload; changed pagination or incomplete/duplicate records
cause a visible error instead of a false “all loaded” claim. Maximum supported
catalog is 20,000 public products, reported explicitly if exceeded.

The public catalog response has no RetailRocket mapping field. Gray nodes therefore
say mapping has not yet been fetched, rather than claiming they lack mapping.
Observed nodes retain the mapping returned by the DB tracking endpoint. All IDs
remain strings. LIVE tests cover complete real pagination, no extra observed
nodes, identity/mapping preservation and stable toggle positions.

The LIVE observation window and last confirmed snapshot are owned by the root
app rather than the conditionally mounted panel. Switching modes stops polling
while inactive, but does not clear the history or advance the since timestamp.
Returning shows the cached graph immediately and resumes reads for the same
window. Only the explicit reset action clears it; actual backend idle expiry,
logout and identity changes retain their existing semantics.

## Actual website recommendation edges

LIVE mode now distinguishes three types of edges:

- Solid green: actual VIEW persisted in PostgreSQL.
- Dashed gold: Item-level `source=lightgcn_session` from the actual recommendation
  API response delivered for this tracking session.
- Dashed blue: Item-level `source=rule_based`, including fallback items in mixed
  batches. No model score is invented for a rule-based item.

The graph panel shows latest response time, surface (`home`, `detail`, `cart`),
context Product ID when relevant, per-item source, reason and score if provided.
Recommendation-only products appear without needing the all-products toggle.
Viewed nodes remain green; otherwise recommended nodes use their source color.
Product-ID layout and identity remain stable when views/recommendations overlap.

`RecommendationGraphStore` is shared through the existing TrackingIdentityModule.
The session-aware home/detail/cart routes copy the response after normal ranking
and fallback handling; no extra inference call or changed ranking is introduced.
`TrackingGraphRepository` first validates cookie ownership and the active DB
session, then reads its cached response and hydrates RetailRocket mappings from
Products. Neither visitor IDs nor cookie tokens are exposed. The response ID is
included in client change detection, so a new recommendation batch updates even
without a new VIEW. Empty responses clear previous recommendation edges.

This is a **transient copy of an API result**, not a persisted impression/click
log or proof the customer saw every card. Only the latest response per session
is retained (up to 20 items), not all historical batches. Multiple website tabs
sharing a session use whichever session-aware request completed last. Cache is
limited to 500 sessions and 30 minutes; it is lost on backend restart or eviction.
Only batches newer than the current display window are returned. If unavailable,
the UI says no new batch is available rather than asserting no past recommendations.
Open/reload the storefront or product page to obtain a fresh real response.
The existing similar/cart legacy rule-only routes without tracking context are
not included; the storefront currently uses the session-aware routes.

No schema migration, model retraining or existing tracking write change is needed.
Switching graph modes preserves the observation window and last confirmed
snapshot. Explicit reset clears both view and recommendation presentation.
A purely new visitor on the website home page may therefore show rule-based
recommendation edges before any VIEW, accurately reflecting cold-start fallback.

Validation adds store tests for source/score fidelity, no response mutation,
identity isolation, TTL, since-window filtering, empty-result clearing and cache
bounds. LIVE integration checks compare graph payload with the real home API
response, verify cookie isolation, and ensure polling does not recompute batches.
