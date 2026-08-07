"""retrieve — query Vertex AI Search KB datastore.

Phase 2 STUB: returns a synthetic chunk list so the graph can be
exercised end-to-end without Vertex AI credentials. The real
implementation lives in `services/rag.py` and is wired in phase 4.
"""
from __future__ import annotations

import structlog

from ..state import SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.retrieve")
_settings = get_settings()


async def retrieve_node(state: SupportTicketState) -> dict:
    log.info("retrieve.start", ticket_id=state.get("ticket_id"), top_k=_settings.top_k)

    if _settings.stub_mode:
        # ─── STUB: synthetic retrieval for offline graph validation ──
        stub_chunks = [
            {
                "id": "kb-stub-1",
                "title": "Resolving upload errors",
                "body": (
                    "If uploads to cloud storage fail with HTTP 504, verify your "
                    "network connectivity, retry with exponential backoff, and check "
                    "the storage bucket region matches your application region."
                ),
                "score": 0.82,
            }
        ]
        log.warning("retrieve.stub_mode", chunks=len(stub_chunks))
        return {"retrieved_chunks": stub_chunks, "status": "retrieved"}

    # ─── Delegated to services.rag.retrieve_kb (handles local or managed RAG) ──
    from ...services.rag import retrieve_kb

    chunks = await retrieve_kb(
        query=state["text"],
        top_k=_settings.top_k,
    )
    return {"retrieved_chunks": chunks, "status": "retrieved"}
