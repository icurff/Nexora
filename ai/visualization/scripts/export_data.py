"""Read-only export of real serving embeddings; no training or inference changes."""
import argparse
import collections
import hashlib
import io
import json
import pickle
from pathlib import Path
import zipfile

import numpy as np
import pandas as pd
import scipy.sparse as sp

APP = Path(__file__).resolve().parents[1]


class MetadataReader(pickle.Unpickler):
    """Read checkpoint metadata without torch or executing arbitrary pickle globals.

    Tensor storage is deliberately discarded: it is NOT a graph adjacency or
    layer-specific output. Only this known checkpoint format is supported.
    """
    def find_class(self, module, name):
        if (module, name) == ('collections', 'OrderedDict'):
            return collections.OrderedDict
        if (module, name) == ('torch', 'FloatStorage'):
            return 'FloatStorage'
        if (module, name) == ('torch._utils', '_rebuild_tensor_v2'):
            return lambda *args: None
        raise ValueError(f'Unsupported checkpoint global: {module}.{name}')

    def persistent_load(self, pid):
        if not isinstance(pid, tuple) or pid[0] != 'storage':
            raise ValueError('Unsupported checkpoint reference')
        return None


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def read_checkpoint(path):
    with zipfile.ZipFile(path) as archive:
        names = [n for n in archive.namelist() if n.endswith('/data.pkl')]
        if len(names) != 1 or archive.getinfo(names[0]).file_size > 2_000_000:
            raise ValueError('Unsupported checkpoint metadata layout')
        return MetadataReader(io.BytesIO(archive.read(names[0]))).load()['meta']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def mapping(path, idx, source_id, size):
    frame = pd.read_parquet(path)
    require({idx, source_id}.issubset(frame.columns), f'{path.name}: missing mapping columns')
    frame = frame.sort_values(idx)
    require(len(frame) == size and np.array_equal(frame[idx], np.arange(size)),
            f'{path.name}: indices must cover embedding rows exactly')
    require(not frame[source_id].isna().any() and frame[source_id].is_unique,
            f'{path.name}: source IDs must be unique and non-null')
    require(pd.api.types.is_integer_dtype(frame[source_id]), f'{path.name}: expected integer source IDs')
    return [str(int(value)) for value in frame[source_id]]


def training_graph(path, expected_hash, shape):
    require(path.is_file(), f'Missing training adjacency: {path}')
    require(digest(path) == expected_hash, 'Training adjacency checksum mismatch with checkpoint')
    matrix = sp.load_npz(path).tocsr()
    require(matrix.shape == shape, 'Training adjacency shape does not match mappings')
    require(matrix.has_canonical_format and np.all(matrix.data == 1),
            'Expected canonical binary User–Item training CSR matrix')
    return matrix


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--artifacts', type=Path, default=APP.parent / 'artifacts/lightgcn_v2')
    parser.add_argument('--output', type=Path, default=APP / 'public/data/graph.json')
    parser.add_argument('--users', type=int, default=600)
    parser.add_argument('--items', type=int, default=900)
    parser.add_argument('--seed', type=int, default=2026)
    parser.add_argument('--training-graph', type=Path, help='Checkpoint-exact train_binary.npz; otherwise auto-detect known local paths')
    parser.add_argument('--embedding-only', action='store_true', help='Explicitly omit interaction graph')
    args = parser.parse_args()
    require(1 <= args.users <= 2000 and 1 <= args.items <= 2000, 'Sample counts must be 1..2000 per type')
    root = args.artifacts
    files = ['selected_user_embeddings.npy', 'selected_item_embeddings.npy',
             'user_mapping.parquet', 'item_mapping.parquet', 'popularity_scores.npy',
             'selected_model_for_serving.json', 'best.pt']
    missing = [str(root / name) for name in files if not (root / name).is_file()]
    require(not missing, 'Required input files missing:\n' + '\n'.join(missing))
    hashes = {name: digest(root / name) for name in files}
    serving = json.loads((root / 'selected_model_for_serving.json').read_text())
    checkpoint = read_checkpoint(root / 'best.pt')
    config = checkpoint['signature']['config']
    for name, field in [('user_mapping.parquet', 'user_mapping_sha256'), ('item_mapping.parquet', 'item_mapping_sha256')]:
        require(hashes[name] == serving[field] == checkpoint['signature']['source_sha256'][name], f'{name}: checksum mismatch')
    require(config['family'] == serving['family'] and config['embedding_dim'] == serving['embedding_dim'], 'Model metadata mismatch')
    require(checkpoint['signature']['seed'] == serving['seed'], 'Model seed mismatch')
    users = np.load(root / files[0], allow_pickle=False).astype(np.float64)
    items = np.load(root / files[1], allow_pickle=False).astype(np.float64)
    dim = serving['embedding_dim']
    for values in [users, items]:
        require(values.ndim == 2 and values.shape[1] == dim and len(values) > 0 and np.isfinite(values).all(), 'Invalid embeddings')
    user_ids = mapping(root / 'user_mapping.parquet', 'user_idx', 'visitorid', len(users))
    item_ids = mapping(root / 'item_mapping.parquet', 'item_idx', 'itemid', len(items))
    pop = np.load(root / 'popularity_scores.npy', allow_pickle=False)
    require(pop.shape == (len(items),) and np.isfinite(pop).all() and (pop >= 0).all(), 'Invalid item popularity')
    require(not (args.embedding_only and args.training_graph), 'Choose --embedding-only or --training-graph, not both')
    graph_path = args.training_graph
    if not args.embedding_only and graph_path is None:
        graph_path = next((p for p in [root / 'train_binary.npz', APP.parent / 'data/processed/visualization_recovery/train_binary.npz'] if p.is_file()), None)
    adjacency = None
    if not args.embedding_only and graph_path is not None:
        adjacency = training_graph(graph_path, checkpoint['signature']['source_sha256']['train_binary.npz'], (len(users), len(items)))
        hashes['train_binary.npz'] = digest(graph_path)

    # Exact PCA from all retained raw vectors, not just the displayed sample.
    # No normalization before PCA: same coordinate system for both node types.
    all_vectors = np.concatenate([users, items])
    mean = all_vectors.mean(axis=0)
    centered = all_vectors - mean
    eigenvalues, basis = np.linalg.eigh(centered.T @ centered / (len(centered) - 1))
    order = np.argsort(eigenvalues)[::-1]
    components = basis[:, order[:3]].copy()
    for column in range(3):
        pivot = np.argmax(np.abs(components[:, column]))
        if components[pivot, column] < 0:
            components[:, column] *= -1  # resolve PCA sign ambiguity reproducibly
    rng = np.random.default_rng(args.seed)
    ui = np.sort(rng.choice(len(users), min(args.users, len(users)), replace=False))
    ii = np.sort(rng.choice(len(items), min(args.items, len(items)), replace=False))
    sample = np.concatenate([users[ui], items[ii]])
    projected = (sample - mean) @ components
    # One scale for all axes; no per-axis distortion. Preserve outliers.
    scale = max(float(np.max(np.linalg.norm(centered @ components, axis=1))), 1e-12)
    positions = projected / scale * 90
    nodes = []
    for kind, indices, ids, vectors in [('user', ui, user_ids, users), ('item', ii, item_ids, items)]:
        for idx in indices:
            position = len(nodes)
            nodes.append({'key': f'{kind}:{int(idx)}', 'type': kind, 'index': int(idx),
                          'sourceId': ids[idx], 'position': positions[position].round(6).tolist(),
                          'vector': vectors[idx].tolist(), 'norm': float(np.linalg.norm(vectors[idx])),
                          'popularity': float(pop[idx]) if kind == 'item' else None,
                          'trainDegree': None})
    # Cross-type nearest neighbors ONLY in the displayed sample, using full D vectors.
    unit = sample / np.maximum(np.linalg.norm(sample, axis=1, keepdims=True), 1e-12)
    cosine = unit[:len(ui)] @ unit[len(ui):].T
    edges = []
    for row in range(len(ui)):
        # Stable tie break by ascending sampled item row index.
        neighbors = np.argsort(-cosine[row], kind='stable')[:min(3, len(ii))]
        for col in neighbors:
            score = float(np.clip(cosine[row, col], -1, 1))
            if score >= 0.15:
                edges.append({'source': nodes[row]['key'], 'target': nodes[len(ui) + col]['key'],
                              'cosine': score, 'dot': float(users[ui[row]] @ items[ii[col]])})
    edge_sources = [p.name for p in root.iterdir() if p.name in ('train_edges.parquet', 'train_binary.npz', 'train_weighted.npz')]
    interactions = None
    if adjacency is not None:
        user_degrees = np.diff(adjacency.indptr)
        item_degrees = np.asarray(adjacency.sum(axis=0)).ravel().astype(np.int64)
        for node in nodes:
            node['trainDegree'] = int((user_degrees if node['type'] == 'user' else item_degrees)[node['index']])
        subgraph = adjacency[ui][:, ii].tocoo()
        # Deterministically bound dense inputs too, keeping total eligible count explicit.
        ordered = np.lexsort((subgraph.col, subgraph.row))[:20000]
        real_edges = [{'source': nodes[int(subgraph.row[pos])]['key'],
                       'target': nodes[len(ui) + int(subgraph.col[pos])]['key']} for pos in ordered]
        interactions = {'totalEdges': int(adjacency.nnz), 'sampledEligibleEdges': int(subgraph.nnz),
                        'edgeLimit': 20000, 'edges': real_edges,
                        'source': 'train_binary.npz', 'sha256': hashes['train_binary.npz'],
                        'popularityMatchesItemDegrees': bool(np.array_equal(pop, item_degrees)),
                        'meaning': 'Observed unique User–Item pairs in the checkpoint training split; not event counts or event types',
                        'layout': 'Same serving-embedding PCA coordinates; edges sourced only from verified training adjacency'}
    result = {'schemaVersion': 2, 'model': {'family': serving['family'], 'runId': serving['run_id'],
              'config': config, 'seed': serving['seed'], 'bestEpoch': checkpoint['best_epoch']},
              'totals': {'users': len(users), 'items': len(items)},
              'sample': {'users': len(ui), 'items': len(ii), 'seed': args.seed, 'method': 'numpy.default_rng choice without replacement, sorted row indices'},
              'projection': {'method': 'Exact centered PCA on all raw retained embeddings',
                  'explainedVariance': (eigenvalues[order[:3]] / eigenvalues.sum()).tolist(),
                  'mean': mean.tolist(), 'components': components.T.tolist(), 'displayScale': scale},
              'provenance': {'sha256': hashes, 'trainingSourceSha256': checkpoint['signature']['source_sha256'],
                  'interactionEdgesExported': interactions is not None, 'adjacencyCandidatesAtArtifactRoot': edge_sources,
                  'edgeMeaning': 'Top 3 sampled items per sampled user by full-dimensional cosine >= 0.15; embedding similarity, NOT observed interactions',
                  'layerEmbeddingsAvailable': False,
                  'popularity': ('Raw popularity_scores.npy matches distinct-user degree per item in checkpoint-verified train_binary.npz'
                                 if interactions and interactions['popularityMatchesItemDegrees'] else
                                 'Raw popularity_scores.npy indexed by item_idx; not verified as distinct-user degree in the current export')},
              'nodes': nodes, 'edges': edges, 'interactions': interactions}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(args.output)
    print(f'Exported {len(nodes)} nodes, {len(edges)} cosine edges to {args.output} ({args.output.stat().st_size:,} bytes)')
    print(f'Retained totals: {len(users)} users / {len(items)} items.')
    if interactions:
        print(f'Verified train pairs: {interactions["totalEdges"]}; exported sampled edges: {len(interactions["edges"])} / {interactions["sampledEligibleEdges"]}')
    else:
        print('Interaction edges exported: NO.')
    print(f'PCA variance retained: {sum(result["projection"]["explainedVariance"]):.2%}')


if __name__ == '__main__':
    main()
