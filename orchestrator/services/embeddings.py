"""services.embeddings — Gemini embedding-001 client + cosine similarity.

Used by the `dedup` node to compare the incoming ticket against recent
tickets in the Firestore ledger.
"""
from __future__ import annotations

import math
from typing import Iterable

import structlog

from ..config import get_settings

log = structlog.get_logger("resolveiq.embeddings")
_settings = get_settings()


class NotImplementedStub(RuntimeError):
    pass


_client: object | None = None


def _get_client():
    if not _settings.uses_real_ai:
        raise NotImplementedStub("embeddings client requested in stub mode")
    global _client
    if _client is not None:
        return _client
    import os
    from google import genai

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or _settings.gemini_api_key
    if api_key:
        _client = genai.Client(api_key=api_key)
    else:
        _client = genai.Client(
            vertexai=True,
            project=_settings.google_project,
            location=_settings.google_location,
        )
    return _client


async def embed(text: str) -> list[float]:
    """Return a 768-dim embedding for `text` using gemini-embedding-001."""
    if not _settings.uses_real_ai:
        raise NotImplementedStub("embed called in stub mode")

    client = _get_client()
    # The google-genai embeddings API call form.
    result = await client.aio.models.embed_content(
        model=_settings.embedding_model,
        contents=text,
    )
    return list(result.embeddings[0].values)


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    """Cosine similarity in [-1, 1] (clipped to [0, 1] for our use case)."""
    a = list(a); b = list(b)
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return max(0.0, dot / (na * nb))
