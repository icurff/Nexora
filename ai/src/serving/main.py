from pathlib import Path
import os
import json

from pydantic import BaseModel, Field
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="Nexora AI Recommendation", version="0.2.0")

AI_ROOT = Path(__file__).resolve().parents[2]

ROOT = Path(os.environ.get(
    "NEXORA_MODEL_DIR",
    str(AI_ROOT / "artifacts/lightgcn_v2"),
)).expanduser().resolve()

MODEL_META = json.loads(
    (ROOT / "selected_model_for_serving.json").read_text()
)

POLICY_PATH = ROOT / "hybrid_policy.json"

HYBRID_POLICY = (
    json.loads(POLICY_PATH.read_text())
    if POLICY_PATH.exists() else {}
)

MODEL_NAME = MODEL_META["family"]
EMBEDDING_DIM = int(MODEL_META["embedding_dim"])
HISTORY_LENGTH = int(HYBRID_POLICY.get("history_length", 3))
RECENCY_DECAY = float(HYBRID_POLICY.get("recency_decay", 0.75))
COLD_ALPHA = float(HYBRID_POLICY.get("cold", {}).get("alpha", 0.75))
WARM_ALPHA = float(HYBRID_POLICY.get("warm", {}).get("alpha", 0.5))
POPULARITY_FALLBACK = POLICY_PATH.exists()

assert HISTORY_LENGTH > 0
assert 0 < RECENCY_DECAY <= 1
assert 0 <= COLD_ALPHA <= 1
assert 0 <= WARM_ALPHA <= 1

user_embeddings = np.load(ROOT / "selected_user_embeddings.npy")
item_embeddings = np.load(ROOT / "selected_item_embeddings.npy")

user_mapping = pd.read_parquet(ROOT / "user_mapping.parquet")
item_mapping = pd.read_parquet(ROOT / "item_mapping.parquet")

assert user_embeddings.ndim == item_embeddings.ndim == 2
assert user_embeddings.shape[1] == EMBEDDING_DIM
assert item_embeddings.shape[1] == EMBEDDING_DIM

assert len(user_embeddings) == int(
    MODEL_META.get("n_users", len(user_embeddings))
)
assert len(item_embeddings) == int(
    MODEL_META.get("n_items", len(item_embeddings))
)

assert np.isfinite(user_embeddings).all()
assert np.isfinite(item_embeddings).all()

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
        "model": MODEL_NAME,
        "users": len(user_embeddings),
        "items": len(item_embeddings),
        "embedding_dim": EMBEDDING_DIM,
        "model_directory": ROOT.name,
        "run_id": MODEL_META.get("run_id"),
        "policy": {
            "history_length": HISTORY_LENGTH,
            "recency_decay": RECENCY_DECAY,
            "cold_alpha": COLD_ALPHA,
            "warm_alpha": WARM_ALPHA,
        },
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
        "model": MODEL_NAME,
        "visitorid": visitorid,
        "items": items,
    }


# ============================================================
# DACN-60 — Session Recommendation for Nexora users
# Based on Task 075's locked cold-user policy.
# ============================================================

class SessionRequest(BaseModel):
    retailrocket_visitorid: int | None = Field(default=None, gt=0)
    # RetailRocket item IDs, ordered oldest -> newest
    recent_itemids: list[int] = Field(
        default_factory=list, max_length=200
    )
    context_itemids: list[int] = Field(default_factory=list, max_length=5000)
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

    # Report unknown inputs so the caller can preserve their session context.
    unknown_recent_itemids = list(dict.fromkeys(
        itemid for itemid in payload.recent_itemids + payload.context_itemids
        if itemid not in item_to_idx
    ))
    # Use the 3 most recent known items (Task 075: Cold User)
    history = [
        item_to_idx[itemid]
        for itemid in payload.recent_itemids
        if itemid in item_to_idx
    ][-HISTORY_LENGTH:]
    context = [item_to_idx[itemid] for itemid in dict.fromkeys(payload.context_itemids)
               if itemid in item_to_idx]

    user_idx = None
    if payload.retailrocket_visitorid is not None:
        user_idx = visitor_to_idx.get(payload.retailrocket_visitorid)
        if user_idx is None:
            raise HTTPException(status_code=404, detail="RetailRocket visitor not found in model")

    if (not history and not context and user_idx is None
            and not POPULARITY_FALLBACK):
        return {
            "source": "lightgcn_session",
            "context_supported": True,
            "strategy": "no_known_session_items",
            "unknown_recent_itemids": unknown_recent_itemids,
            "items": [],
        }

    # Normalize recent interaction weights, newest has weight 1
    session_vectors = []
    if history:
        weights = np.power(
            RECENCY_DECAY, np.arange(len(history) - 1, -1, -1),
        ).astype(np.float32)
        session_vector = (item_unit[history] * weights[:, None]).sum(axis=0)
        session_vector /= max(float(np.linalg.norm(session_vector)), 1e-12)
        session_vectors.append(session_vector)
    if context:
        context_vector = item_unit[context].mean(axis=0)
        context_vector /= max(float(np.linalg.norm(context_vector)), 1e-12)
        session_vectors.append(context_vector)
    if session_vectors:
        session_scores = sum(item_unit @ vector for vector in session_vectors) / len(session_vectors)

    # The mean of the exact vectors used in session_scores. Do not normalize
    # it again: with history + context, inference uses the mean of their scores.
    session_geometry = (
        {
            "model_run_id": MODEL_META.get("run_id"),
            "vector": np.mean(session_vectors, axis=0).tolist(),
        }
        if session_vectors else None
    )

    # Explainable ranking: preserve the original scoring policy.
    session_z = (
        zscore(session_scores) if session_vectors else None
    )
    popularity_z = None
    user_z = None

    if user_idx is not None:
        user_scores = item_embeddings @ user_embeddings[user_idx]
        user_z = zscore(user_scores)

        session_weight = WARM_ALPHA if session_vectors else 0.0
        user_weight = 1.0 - session_weight
        popularity_weight = 0.0

        scores = user_weight * user_z

        if session_z is not None:
            scores = scores + session_weight * session_z

    else:
        base_scores = np.log1p(popularity).copy()
        base_scores -= (
            np.arange(len(base_scores), dtype=np.float32) * 1e-9
        )

        popularity_z = zscore(base_scores)

        session_weight = COLD_ALPHA if session_vectors else 0.0
        popularity_weight = 1.0 - session_weight
        user_weight = 0.0

        scores = popularity_weight * popularity_z

        if session_z is not None:
            scores = scores + session_weight * session_z

    excluded = set(payload.recent_itemids)
    excluded.update(payload.context_itemids)
    excluded.update(payload.exclude_itemids)

    candidate_ids = [
        itemid
        for itemid in dict.fromkeys(payload.candidate_itemids)
        if itemid in item_to_idx and itemid not in excluded
    ]

    if not candidate_ids:
        return {
            "source": "lightgcn_session",
            "context_supported": True,
            "strategy": "no_eligible_candidates",
            "unknown_recent_itemids": unknown_recent_itemids,
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

    for rank, itemid in enumerate(ranked, start=1):
        idx = item_to_idx[itemid]

        evidence_items = history + context
        similarities = item_unit[evidence_items] @ item_unit[idx]
        best_pos = int(np.argmax(similarities)) if evidence_items else 0
        best_similarity = float(similarities[best_pos]) if evidence_items else -1.0

        if session_weight > 0 and best_similarity >= 0.15:
            reason = "SIMILAR_TO_RECENT_VIEW" if best_pos < len(history) else "SIMILAR_TO_PAGE_CONTEXT"
            evidence = {
                "recent_source_item_id": idx_to_item[
                    evidence_items[best_pos]
                ],
                "cosine_similarity": round(best_similarity, 4),
            }
        elif user_weight > 0 and user_idx is not None:
            reason = "TRAINED_USER_PROFILE"
            evidence = {}
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
            "rank": rank,
            "score_breakdown": {
                "session_score": (
                    float(session_z[idx])
                    if session_z is not None else None
                ),
                "popularity_score": (
                    float(popularity_z[idx])
                    if popularity_z is not None else None
                ),
                "user_score": (
                    float(user_z[idx])
                    if user_z is not None else None
                ),
                "session_weight": session_weight,
                "popularity_weight": popularity_weight,
                "user_weight": user_weight,
                "session_contribution": (
                    float(session_weight * session_z[idx])
                    if session_z is not None else 0.0
                ),
                "popularity_contribution": (
                    float(popularity_weight * popularity_z[idx])
                    if popularity_z is not None else 0.0
                ),
                "user_contribution": (
                    float(user_weight * user_z[idx])
                    if user_z is not None else 0.0
                ),
                "final_score": float(scores[idx]),
                "session_geometry": session_geometry,
            },
        })

    return {
        "source": "lightgcn_session",
        "context_supported": True,
        "unknown_recent_itemids": unknown_recent_itemids,
        "strategy": (
            ("trained_user_session" if session_vectors else "trained_user")
            if user_idx is not None
            else ("cold_session_hybrid" if session_vectors else "popularity_only")
        ),
        "model": MODEL_NAME,
        "policy": {
            "history_length": HISTORY_LENGTH,
            "recency_decay": RECENCY_DECAY,
            **({"user_weight": user_weight, "session_weight": session_weight} if user_idx is not None else {}),
            **({"recent_view_weight": 0.5, "page_context_weight": 0.5} if history and context else {}),
            **({"alpha": session_weight} if user_idx is None else {}),
        },
        "items": items,
    }
