"""Contract tests against local real artifacts. No source artifact is modified."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import pandas as pd

from export_data import APP, mapping, read_checkpoint, training_graph
import scipy.sparse as sp


class ExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.artifacts = APP.parent / 'artifacts/lightgcn_v2'
        cls.output = cls.root / 'graph.json'
        cls.command = [sys.executable, str(APP / 'scripts/export_data.py'), '--embedding-only', '--users', '12', '--items', '20', '--output', str(cls.output)]
        subprocess.run(cls.command, check=True, capture_output=True)
        cls.data = json.loads(cls.output.read_text())

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_deterministic_export(self):
        before = hashlib.sha256(self.output.read_bytes()).hexdigest()
        subprocess.run(self.command, check=True, capture_output=True)
        self.assertEqual(before, hashlib.sha256(self.output.read_bytes()).hexdigest())

    def test_source_mapping_vectors_and_pca(self):
        projection = self.data['projection']
        for kind, prefix, source_id in [('user', 'user', 'visitorid'), ('item', 'item', 'itemid')]:
            vectors = np.load(self.artifacts / f'selected_{prefix}_embeddings.npy')
            ids = pd.read_parquet(self.artifacts / f'{prefix}_mapping.parquet').set_index(f'{prefix}_idx')[source_id]
            for node in self.data['nodes']:
                if node['type'] != kind:
                    continue
                self.assertEqual(node['sourceId'], str(ids.loc[node['index']]))
                np.testing.assert_array_equal(node['vector'], vectors[node['index']].astype(np.float64))
                expected = (np.array(node['vector']) - projection['mean']) @ np.array(projection['components']).T / projection['displayScale'] * 90
                np.testing.assert_allclose(node['position'], expected, atol=0.00000051)
                if kind == 'item':
                    self.assertEqual(node['popularity'], float(np.load(self.artifacts / 'popularity_scores.npy')[node['index']]))
        self.assertFalse(self.data['provenance']['interactionEdgesExported'])
        self.assertFalse(self.data['provenance']['layerEmbeddingsAvailable'])

    def test_similarity_scores_and_top_k(self):
        nodes = {n['key']: n for n in self.data['nodes']}
        items = [n for n in self.data['nodes'] if n['type'] == 'item']
        for edge in self.data['edges']:
            user, item = nodes[edge['source']], nodes[edge['target']]
            u, i = np.array(user['vector']), np.array(item['vector'])
            self.assertEqual((user['type'], item['type']), ('user', 'item'))
            self.assertAlmostEqual(edge['cosine'], float(u @ i / (np.linalg.norm(u) * np.linalg.norm(i))))
            self.assertAlmostEqual(edge['dot'], float(u @ i))
            self.assertGreaterEqual(edge['cosine'], 0.15)
            better = sum(float(u @ np.array(n['vector']) / (np.linalg.norm(u) * n['norm'])) > edge['cosine'] + 1e-12 for n in items)
            self.assertLess(better, 3)

    def test_bad_mapping_rejected(self):
        path = self.root / 'bad.parquet'
        for frame in [pd.DataFrame({'user_idx': [0, 0], 'visitorid': [1, 2]}),
                      pd.DataFrame({'user_idx': [0, 1], 'visitorid': [1, 1]})]:
            frame.to_parquet(path)
            with self.assertRaises(ValueError):
                mapping(path, 'user_idx', 'visitorid', 2)

    def test_missing_and_invalid_inputs_fail_without_asset(self):
        missing_output = self.root / 'must-not-exist.json'
        result = subprocess.run(self.command + ['--artifacts', str(self.root / 'missing'), '--output', str(missing_output)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('selected_user_embeddings.npy', result.stderr)
        self.assertFalse(missing_output.exists())
        result = subprocess.run(self.command + ['--users', '0'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('1..2000', result.stderr)


class InteractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        cls.path = APP.parent / 'data/processed/visualization_recovery/train_binary.npz'
        if not cls.path.is_file():
            cls.temp.cleanup()
            raise unittest.SkipTest('Recover the checkpoint-exact training adjacency first')
        cls.output = cls.root / 'graph.json'
        cls.command = [sys.executable, str(APP / 'scripts/export_data.py'), '--training-graph', str(cls.path), '--output', str(cls.output)]
        subprocess.run(cls.command, check=True, capture_output=True)
        cls.data = json.loads(cls.output.read_text())
        cls.matrix = sp.load_npz(cls.path).tocsr()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_exported_edges_are_exact_induced_training_subgraph(self):
        data = self.data
        self.assertTrue(data['provenance']['interactionEdgesExported'])
        self.assertEqual(data['interactions']['totalEdges'], self.matrix.nnz)
        ui = [n['index'] for n in data['nodes'] if n['type'] == 'user']
        ii = [n['index'] for n in data['nodes'] if n['type'] == 'item']
        induced = self.matrix[ui][:, ii].tocoo()
        expected = {(f'user:{ui[r]}', f'item:{ii[c]}') for r, c in zip(induced.row, induced.col)}
        exported = {(e['source'], e['target']) for e in data['interactions']['edges']}
        self.assertEqual(exported, expected)
        self.assertEqual(len(exported), len(data['interactions']['edges']))
        self.assertEqual(data['interactions']['sampledEligibleEdges'], induced.nnz)
        self.assertEqual(data['interactions']['sha256'], data['provenance']['trainingSourceSha256']['train_binary.npz'])
        degrees = {'user': np.asarray(self.matrix.sum(axis=1)).ravel(), 'item': np.asarray(self.matrix.sum(axis=0)).ravel()}
        for n in data['nodes']:
            self.assertEqual(n['trainDegree'], degrees[n['type']][n['index']])

    def test_checksum_and_shape_mismatch_rejected(self):
        expected = read_checkpoint(APP.parent / 'artifacts/lightgcn_v2/best.pt')['signature']['source_sha256']['train_binary.npz']
        bad = self.root / 'bad.npz'
        bad.write_bytes(self.path.read_bytes() + b'corruption')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            training_graph(bad, expected, self.matrix.shape)
        with self.assertRaisesRegex(ValueError, 'shape'):
            training_graph(self.path, expected, (1, 1))
        before = self.output.read_bytes()
        result = subprocess.run(self.command + ['--training-graph', str(bad)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, self.output.read_bytes())

    def test_projector_preserves_original_vectors_and_row_identity(self):
        output = self.root / 'projector'
        subprocess.run([sys.executable, str(APP / 'scripts/export_projector.py'), '--graph', str(self.output), '--output', str(output)], check=True, capture_output=True)
        vectors = np.loadtxt(output / 'vectors.tsv', delimiter='\t')
        np.testing.assert_array_equal(vectors, np.array([n['vector'] for n in self.data['nodes']]))
        rows = (output / 'metadata.tsv').read_text().splitlines()
        self.assertEqual(len(rows), len(vectors) + 1)
        for row, node in zip(rows[1:], self.data['nodes']):
            fields = row.split('\t')
            self.assertEqual(fields[0], f'{node["type"]}:{node["sourceId"]}')
            self.assertEqual(fields[2], node['sourceId'])
            self.assertEqual(int(fields[3]), node['index'])


if __name__ == '__main__':
    unittest.main()
