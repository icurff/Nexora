from pathlib import Path

from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="Nexora AI Recommendation", version="0.2.0")

ROOT = Path(__file__).resolve().parents[2] / "artifacts/lightgcn_v2"

user_embeddings = np.load(ROOT / "selected_user_embeddings.npy")
item_embeddings = np.load(ROOT / "selected_item_embeddings.npy")

user_mapping = pd.read_parquet(ROOT / "user_mapping.parquet")
item_mapping = pd.read_parquet(ROOT / "item_mapping.parquet")

assert user_embeddings.shape == (43583, 64)
assert item_embeddings.shape == (20000, 64)

visitor_to_idx = dict(
    zip(
        user_mapping["visitorid"].astype(int),
        user_mapping["user_idx"].astype(int),
    )
)

idx_to_item = dict(
    zip(
        item_mapping["item_idx"].astype(int),
        item_mapping["itemid"].astype(int),
    )
)

assert len(visitor_to_idx) == len(user_embeddings)
assert len(idx_to_item) == len(item_embeddings)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "nexora-ai",
        "model_loaded": True,
        "model": "LightGCN_WeightedSampling",
        "users": len(user_embeddings),
        "items": len(item_embeddings),
    }


@app.get("/recommend")
def recommend(
    visitorid: int,
    limit: int = Query(default=10, ge=1, le=50),
):
    user_idx = visitor_to_idx.get(visitorid)

    if user_idx is None:
        raise HTTPException(
            status_code=404,
            detail="RetailRocket visitor not found in model",
        )

    user_vector = user_embeddings[user_idx]

    scores = item_embeddings @ user_vector

    top_indices = np.argpartition(
        scores, -limit
    )[-limit:]

    top_indices = top_indices[
        np.argsort(scores[top_indices])[::-1]
    ]

    items = [
        {
            "retailrocket_itemid": idx_to_item[int(i)],
            "score": float(scores[i]),
        }
        for i in top_indices
    ]

    return {
        "source": "lightgcn",
        "model": "LightGCN_WeightedSampling",
        "visitorid": visitorid,
        "items": items,
    }


# ============================================================
# DACN-60 — Session Recommendation for Nexora users
# Based on Task 075's locked cold-user policy.
# ============================================================

class SessionRequest(BaseModel):
    # RetailRocket item IDs, ordered oldest -> newest
    recent_itemids: list[int] = Field(
        default_factory=list, max_length=200
    )
    # Only sellable Nexora products should be provided here
    candidate_itemids: list[int] = Field(
        min_length=1, max_length=5000
    )
    exclude_itemids: list[int] = Field(
        default_factory=list, max_length=5000
    )
    limit: int = Field(default=10, ge=1, le=20)


item_to_idx = {
    int(row.itemid): int(row.item_idx)
    for row in item_mapping.itertuples(index=False)
}

item_unit = item_embeddings.astype(np.float32)
item_unit = item_unit / np.maximum(
    np.linalg.norm(item_unit, axis=1, keepdims=True),
    1e-12,
)

popularity_path = ROOT / "popularity_scores.npy"
popularity = (
    np.load(popularity_path).astype(np.float32)
    if popularity_path.exists()
    else None
)

if popularity is not None:
    assert popularity.shape == (len(item_embeddings),)
    assert np.isfinite(popularity).all()
    assert (popularity >= 0).all()


def zscore(values: np.ndarray) -> np.ndarray:
    return (values - values.mean()) / max(
        float(values.std()), 1e-6
    )


@app.post("/recommend/session")
def recommend_session(payload: SessionRequest):
    if popularity is None:
        raise HTTPException(
            status_code=503,
            detail="Missing Task 074 popularity_scores.npy",
        )

    # Use the 3 most recent known items (Task 075: Cold User)
    history = [
        item_to_idx[itemid]
        for itemid in payload.recent_itemids
        if itemid in item_to_idx
    ][-3:]

    if not history:
        return {
            "source": "lightgcn_session",
            "strategy": "no_known_session_items",
            "items": [],
        }

    # Normalize recent interaction weights, newest has weight 1
    weights = np.power(
        0.75,
        np.arange(len(history) - 1, -1, -1),
    ).astype(np.float32)

    session_vector = (
        item_unit[history] * weights[:, None]
    ).sum(axis=0)

    session_vector /= max(
        float(np.linalg.norm(session_vector)), 1e-12
    )

    # Score all 20k model items BEFORE selecting catalog candidates.
    session_scores = item_unit @ session_vector

    base_scores = np.log1p(popularity).copy()
    base_scores -= (
        np.arange(len(base_scores), dtype=np.float32) * 1e-9
    )

    # Locked Cold User policy: alpha=0.75
    scores = (
        0.25 * zscore(base_scores)
        + 0.75 * zscore(session_scores)
    )

    excluded = set(payload.recent_itemids)
    excluded.update(payload.exclude_itemids)

    candidate_ids = [
        itemid
        for itemid in dict.fromkeys(payload.candidate_itemids)
        if itemid in item_to_idx and itemid not in excluded
    ]

    if not candidate_ids:
        return {
            "source": "lightgcn_session",
            "strategy": "no_eligible_candidates",
            "items": [],
        }

    ranked = sorted(
        candidate_ids,
        key=lambda itemid: (
            -float(scores[item_to_idx[itemid]]),
            itemid,
        ),
    )[:payload.limit]

    items = []

    for itemid in ranked:
        idx = item_to_idx[itemid]

        similarities = item_unit[history] @ item_unit[idx]
        best_pos = int(np.argmax(similarities))
        best_similarity = float(similarities[best_pos])

        if best_similarity >= 0.15:
            reason = "SIMILAR_TO_RECENT_VIEW"
            evidence = {
                "recent_source_item_id": idx_to_item[
                    history[best_pos]
                ],
                "cosine_similarity": round(best_similarity, 4),
            }
        else:
            reason = "POPULAR_TRAIN"
            evidence = {
                "train_user_count": int(popularity[idx]),
            }

        items.append({
            "retailrocket_itemid": itemid,
            "score": float(scores[idx]),
            "reason_code": reason,
            "evidence": evidence,
        })

    return {
        "source": "lightgcn_session",
        "strategy": "cold_session_hybrid",
        "model": "LightGCN_WeightedSampling",
        "policy": {
            "alpha": 0.75,
            "history_length": 3,
            "recency_decay": 0.75,
        },
        "items": items,
    }
