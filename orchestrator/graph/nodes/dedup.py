"""dedup — cross-channel semantic clustering.

Phase 2 STUB: clusters tickets using a lightweight trigram Jaccard
similarity (no embedding needed) so that near-identical phrasing variants
across channels properly aggregate into one cluster and the incident
path fires at cluster_size ≥ 3 during offline demo.

Real implementation (when `uses_real_firestore` is True) is delegated to
`services/embeddings.py` + `graph/persistence.py` and queries the
Firestore recent-tickets ledger for cosine similarity ≥ threshold using
`gemini-embedding-001`.
"""
from __future__ import annotations

import hashlib
import re
from typing import Iterable

import structlog

from ..state import SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.dedup")
_settings = get_settings()


# ─── Stub similarity: trigram Jaccard over normalized text ──────────
_STOPWORDS = {
    "the", "a", "an", "and", "or", "to", "of", "in", "for", "is", "are",
    "with", "on", "at", "by", "my", "we", "i", "you", "it", "this", "that",
    "hi", "hello", "team", "anyone", "else", "seeing", "since", "morning",
    "last", "hour", " session", "do", "does",
}


def _normalize(text: str) -> list[str]:
    """Lowercase, strip punctuation, drop stopwords."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = [t for t in text.split() if t and t not in _STOPWORDS]
    return tokens


def _trigrams(tokens: Iterable[str]) -> set[str]:
    """Bag of bigrams (not trigrams — support queries are short)."""
    toks = list(tokens)
    if len(toks) < 2:
        return set(" ".join(toks)) if toks else set()
    return {" ".join(toks[i : i + 2]) for i in range(len(toks) - 1)}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = a & b
    union = a | b
    return len(inter) / len(union) if union else 0.0


_STUB_SIM_THRESHOLD = 0.40     # Bigram Jaccard — threshold set to 0.40 to ensure
                              # only strongly matching intents cluster offline.


def _new_cluster_id(text: str) -> str:
    norm = " ".join(_normalize(text))
    return "cl_" + hashlib.md5(norm.encode("utf-8")).hexdigest()[:10]


async def dedup_node(state: SupportTicketState) -> dict:
    log.info("dedup.start", ticket_id=state.get("ticket_id"))
    text = state.get("text", "")

    if not _settings.uses_real_firestore:
        # ─── STUB: trigram-Jaccard clustering against in-memory ledger ─
        cur_trigrams = _trigrams(_normalize(text))
        best_id, best_sim = None, 0.0
        matched_answer = None

        if _settings.uses_real_ai:
            from ...services.gemini import find_semantic_match
            candidates = [
                {"cluster_id": cid, "first_text": val["first_text"], "answer": val.get("answer")}
                for cid, val in _STUB_CLUSTER_LEDGER.items()
            ]
            best_id, matched_answer = await find_semantic_match(query=text, candidates=candidates)

        if not best_id:
            for cid, entry in _STUB_CLUSTER_LEDGER.items():
                sim = _jaccard(cur_trigrams, entry["trigrams"])
                if sim >= _STUB_SIM_THRESHOLD and sim > best_sim:
                    best_id, best_sim = cid, sim
                    matched_answer = entry.get("answer")

        cluster_id = best_id or _new_cluster_id(text)
        # Persist this ticket into the ledger.
        entry = _STUB_CLUSTER_LEDGER.setdefault(
            cluster_id, {"trigrams": cur_trigrams, "count": 0, "first_text": text}
        )
        entry["count"] += 1
        
        if state.get("answer"):
            entry["answer"] = state.get("answer")
        elif "answer" not in entry:
            entry["answer"] = ""

        counter = entry["count"]
        log.warning(
            "dedup.stub_mode",
            cluster_id=cluster_id,
            size=counter,
            best_sim=best_sim,
        )
        ret = {
            "cluster_id": cluster_id,
            "cluster_size": counter,
            "cluster_representative": entry["first_text"],
            "status": "clustered",
        }
        if matched_answer:
            ret["answer"] = matched_answer
            ret["confidence"] = 1.0
        return ret

    # ─── REAL: delegated to the persistence ledger query (phase 5/6) ─
    from ..persistence import query_recent_tickets, write_ticket_ledger
    from ...services.embeddings import embed, cosine

    emb = state.get("embedding") or await embed(text)
    recent = await query_recent_tickets(
        channel=None,
        limit=_settings.recent_tickets_limit,
        minutes=_settings.incident_window_minutes,
    )
    
    best_id, best_sim = None, 0.0
    matched_answer = None

    if _settings.uses_real_ai:
        from ...services.gemini import find_semantic_match
        candidates = [
            {"cluster_id": r.get("cluster_id"), "first_text": r.get("text"), "answer": r.get("answer")}
            for r in recent if r.get("text")
        ]
        best_id, matched_answer = await find_semantic_match(query=text, candidates=candidates)

    if not best_id:
        for r in recent:
            if r.get("embedding"):
                sim = cosine(emb, r["embedding"])
                if sim >= _settings.dedup_sim_threshold and sim > best_sim:
                    best_id, best_sim = r.get("cluster_id"), sim
                    matched_answer = r.get("answer")

    cluster_id = best_id or _new_cluster_id(text)
    counter = sum(1 for r in recent if r.get("cluster_id") == cluster_id) + 1
    await write_ticket_ledger(
        ticket_id=state["ticket_id"],
        channel=state["channel"],
        text=text,
        embedding=emb,
        cluster_id=cluster_id,
        answer=state.get("answer"),
    )
    ret = {
        "cluster_id": cluster_id,
        "cluster_size": counter,
        "embedding": emb,
        "status": "clustered",
    }
    if matched_answer:
        ret["answer"] = matched_answer
        ret["confidence"] = 1.0
    return ret


# Process-local stub ledger — {cluster_id: {"trigrams": set, "count": int, "first_text": str}}.
_STUB_CLUSTER_LEDGER: dict[str, dict] = {}
