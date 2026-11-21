"""Export the current verified visualization sample to TensorFlow Projector TSVs.

Reads graph.json produced by export_data.py, preserves its row order and IDs,
and writes full original-D vectors (not projected 3D coordinates).
"""
import argparse
import json
from pathlib import Path

from export_data import APP, digest, require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--graph', type=Path, default=APP / 'public/data/graph.json')
    parser.add_argument('--output', type=Path, default=APP / 'public/projector')
    args = parser.parse_args()
    data = json.loads(args.graph.read_text())
    require(data['schemaVersion'] == 2 and len(data['nodes']) > 0, 'Export graph.json schema v2 first')
    args.output.mkdir(parents=True, exist_ok=True)
    vectors = []
    metadata = ['label\ttype\tsource_id\tembedding_index\ttrain_degree\tpopularity']
    dim = data['model']['config']['embedding_dim']
    for node in data['nodes']:
        require(len(node['vector']) == dim, 'Invalid embedding dimension')
        vectors.append('\t'.join(format(v, '.17g') for v in node['vector']))
        values = [f'{node["type"]}:{node["sourceId"]}', node['type'], node['sourceId'],
                  node['index'], node['trainDegree'], node['popularity']]
        metadata.append('\t'.join('' if v is None else str(v) for v in values))
    (args.output / 'vectors.tsv').write_text('\n'.join(vectors) + '\n')
    (args.output / 'metadata.tsv').write_text('\n'.join(metadata) + '\n')
    manifest = {'model': data['model'], 'rows': len(vectors), 'dimensions': dim,
                'inputGraphSha256': digest(args.graph), 'sourceSha256': data['provenance']['sha256'],
                'sample': data['sample'], 'rowOrder': 'Identical to graph.json nodes; users then items',
                'meaning': 'Raw serving embeddings for Projector. No adjacency is encoded in these TSV files.'}
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Projector: {len(vectors)} rows x {dim} dimensions. Files: {args.output}')


if __name__ == '__main__':
    main()
