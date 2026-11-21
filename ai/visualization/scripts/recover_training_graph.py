"""Recover Task 073 graph from real clean events; accept only checkpoint-exact NPZs.

Reproduces the inspected DACN_2_3_Temporal_Split.ipynb preprocessing cells.
Never trains, alters serving artifacts, or writes back to source datasets.
"""
import argparse
import io
import json
from pathlib import Path
import shutil
import tempfile
import zipfile

import numpy as np
import pandas as pd
import scipy.sparse as sp

from export_data import APP, digest, read_checkpoint, require


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--events', type=Path, required=True, help='events_clean.parquet or data_clean_parquet.zip')
    parser.add_argument('--artifacts', type=Path, default=APP.parent / 'artifacts/lightgcn_v2')
    parser.add_argument('--output', type=Path, default=APP.parent / 'data/processed/visualization_recovery')
    args = parser.parse_args()
    root = args.artifacts
    expected = read_checkpoint(root / 'best.pt')['signature']['source_sha256']
    require(args.events.is_file(), f'Missing clean input: {args.events}')
    if args.events.suffix == '.zip':
        with zipfile.ZipFile(args.events) as archive:
            names = [n for n in archive.namelist() if Path(n).name == 'events_clean.parquet']
            require(len(names) == 1, 'Archive must contain exactly one events_clean.parquet')
            INPUT = io.BytesIO(archive.read(names[0]))
    else:
        INPUT = args.events
    MAX_USERS, MAX_ITEMS = 50_000, 20_000
    MIN_USER_TRAIN, MIN_ITEM_TRAIN = 2, 3
    WEIGHTS = {'view': 1.0, 'addtocart': 3.0, 'transaction': 5.0}
    events = pd.read_parquet(INPUT, columns=['timestamp','visitorid','itemid','event'])
    required = {'timestamp','visitorid','itemid','event'}
    assert required.issubset(events.columns)
    events['timestamp'] = pd.to_datetime(events['timestamp'], errors='coerce', utc=True)
    events['visitorid'] = pd.to_numeric(events['visitorid'], errors='coerce')
    events['itemid'] = pd.to_numeric(events['itemid'], errors='coerce')
    events['event'] = events['event'].astype('string').str.strip().str.lower()
    before = len(events)
    events = events.dropna(subset=['timestamp','visitorid','itemid','event'])
    events = events[events.event.isin(WEIGHTS)].copy()
    events[['visitorid','itemid']] = events[['visitorid','itemid']].astype('int64')
    events = events.drop_duplicates(['timestamp','visitorid','itemid','event'])
    print('Rows before:', before, 'after schema validation/dedup:', len(events))
    print('Time:', events.timestamp.min(), '→', events.timestamp.max())
    print('Event counts:')
    print(events.event.value_counts().to_string())
    assert len(events) > 100
    assert events.timestamp.notna().all()

    events = events.sort_values(['timestamp','visitorid','itemid'], kind='stable').reset_index(drop=True)
    t1 = events.loc[int(len(events)*0.8), 'timestamp']
    t2 = events.loc[int(len(events)*0.9), 'timestamp']
    assert t1 < t2, 'Hai mốc thời gian bị trùng. Cần chọn mốc độc lập.'
    train_raw = events.loc[events.timestamp < t1].copy()
    val_raw = events.loc[(events.timestamp >= t1) & (events.timestamp < t2)].copy()
    test_raw = events.loc[events.timestamp >= t2].copy()
    assert len(train_raw)+len(val_raw)+len(test_raw) == len(events)
    assert train_raw.timestamp.max() < val_raw.timestamp.min()
    assert val_raw.timestamp.max() < test_raw.timestamp.min()
    for name, df in [('Train',train_raw),('Val',val_raw),('Test',test_raw)]:
        print(f'{name:5s}: {len(df):>10,} events, {df.visitorid.nunique():>9,} users, {df.itemid.nunique():>8,} items')
    print('Cutoff train→val:', t1)
    print('Cutoff val→test:', t2)

    # Mỗi user–item chỉ tính 1 lần khi chọn cohort.
    train_pairs_all = train_raw[['visitorid','itemid']].drop_duplicates()
    user_counts = train_pairs_all.groupby('visitorid').size().rename('n')
    user_counts = user_counts[user_counts >= MIN_USER_TRAIN].sort_values(ascending=False, kind='stable')
    selected_users = user_counts.head(MAX_USERS).index
    cohort_pairs = train_pairs_all[train_pairs_all.visitorid.isin(selected_users)]
    item_counts = cohort_pairs.groupby('itemid').size().rename('n')
    item_counts = item_counts[item_counts >= MIN_ITEM_TRAIN].sort_values(ascending=False, kind='stable')
    selected_items = item_counts.head(MAX_ITEMS).index

    # Một lượt lọc tiếp để giữ user vẫn có >= MIN_USER_TRAIN item trong item cohort.
    cohort_pairs = cohort_pairs[cohort_pairs.itemid.isin(selected_items)]
    valid_users = cohort_pairs.groupby('visitorid').size()
    selected_users = valid_users[valid_users >= MIN_USER_TRAIN].index
    train_cohort = train_raw[
        train_raw.visitorid.isin(selected_users) & train_raw.itemid.isin(selected_items)
    ].copy()
    # Bỏ item cô lập do lượt lọc user (để graph và mapping chính xác).
    selected_items = pd.Index(sorted(train_cohort.itemid.unique()))
    selected_users = pd.Index(sorted(train_cohort.visitorid.unique()))
    assert train_cohort.visitorid.nunique() > 0 and train_cohort.itemid.nunique() > 0
    print('Training cohort events:', len(train_cohort))
    print('Training cohort users:', len(selected_users))
    print('Training cohort items:', len(selected_items))
    print('Distinct train edges:', len(train_cohort[['visitorid','itemid']].drop_duplicates()))

    user_map = pd.DataFrame({'visitorid': selected_users.to_numpy(dtype=np.int64)})
    user_map['user_idx'] = np.arange(len(user_map), dtype=np.int32)
    item_map = pd.DataFrame({'itemid': selected_items.to_numpy(dtype=np.int64)})
    item_map['item_idx'] = np.arange(len(item_map), dtype=np.int32)
    assert user_map.visitorid.is_unique and item_map.itemid.is_unique
    assert user_map.user_idx.is_unique and item_map.item_idx.is_unique
    print(user_map.head())
    print(item_map.head())

    graph_events = train_cohort.merge(user_map, on='visitorid', how='inner').merge(item_map,on='itemid',how='inner')
    graph_events['event_weight'] = graph_events.event.map(WEIGHTS).astype('float32')
    train_edges = graph_events.groupby(['user_idx','item_idx'],as_index=False,sort=True)['event_weight'].sum()
    train_edges = train_edges.rename(columns={'event_weight':'raw_weight'})
    train_edges['weight'] = np.log1p(train_edges.raw_weight).astype('float32')
    train_edges['binary'] = np.ones(len(train_edges), dtype=np.float32)
    assert train_edges.duplicated(['user_idx','item_idx']).sum()==0
    print('Edges:', len(train_edges))
    print(train_edges.head())

    shape = (len(user_map), len(item_map))
    row = train_edges.user_idx.to_numpy(dtype=np.int32)
    col = train_edges.item_idx.to_numpy(dtype=np.int32)
    R_binary = sp.csr_matrix((train_edges.binary.to_numpy(dtype=np.float32),(row,col)),shape=shape)
    R_weighted = sp.csr_matrix((train_edges.weight.to_numpy(dtype=np.float32),(row,col)),shape=shape)
    assert R_binary.nnz == len(train_edges)
    assert R_weighted.nnz == len(train_edges)
    print('Shape:', shape, '| Nonzero edges:', R_binary.nnz)
    print('Binary memory approx (MB):',round((R_binary.data.nbytes+R_binary.indices.nbytes+R_binary.indptr.nbytes)/1e6,2))

    for kind, frame in [('user', user_map), ('item', item_map)]:
        name = f'{kind}_mapping.parquet'
        require(digest(root / name) == expected[name], f'{name}: checkpoint checksum mismatch')
        pd.testing.assert_frame_equal(frame, pd.read_parquet(root / name))
    # Verify both NPZs BEFORE making any recovered output available to the app.
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output) as temporary:
        temporary = Path(temporary)
        hashes = {}
        for name, matrix in [('train_binary.npz', R_binary), ('train_weighted.npz', R_weighted)]:
            sp.save_npz(temporary / name, matrix)
            hashes[name] = digest(temporary / name)
            require(hashes[name] == expected[name],
                    f'{name}: recovered bytes do not match checkpoint. Obtain the original Task 073 artifacts instead.')
        # No unverified regenerated Parquet is published: Arrow metadata varies by version.
        manifest = {
            'method': 'Task 073 preprocessing replay, exact binary and weighted NPZ checksum verification',
            'sourceFile': args.events.name, 'sourceSha256': digest(args.events),
            'recoveredSha256': hashes, 'users': len(user_map), 'items': len(item_map),
            'trainEdges': len(train_edges), 'trainEndExclusive': t1.isoformat(),
            'validationEndExclusive': t2.isoformat(),
            'eventWeights': WEIGHTS, 'trainOnly': True,
            'versions': {'numpy': np.__version__, 'pandas': pd.__version__},
        }
        for name in hashes:
            shutil.copyfile(temporary / name, args.output / name)
        (args.output / 'recovery_manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'VERIFIED: {len(train_edges):,} real train pairs. Output: {args.output}')


if __name__ == '__main__':
    main()
