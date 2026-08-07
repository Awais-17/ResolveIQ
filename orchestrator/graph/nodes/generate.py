"""generate — Gemini grounded answer + confidence.

Phase 2 STUB: returns a fixed answer + confidence so the graph branches
and we can validate the conditional-edge logic before wiring Vertex AI.
Real implementation in `services/gemini.py` (phase 3) attaches a Vertex
AI Search Retrieval tool and reads `groundingMetadata.grounding_score`.
"""
from __future__ import annotations

import structlog

from ..state import AnswerWithConfidence, SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.generate")
_settings = get_settings()


async def generate_node(state: SupportTicketState) -> dict:
    log.info("generate.start", ticket_id=state.get("ticket_id"), chunks=len(state.get("retrieved_chunks", [])))

    if not _settings.uses_real_ai:
        # ─── STUB: deterministic answer for offline graph validation ──
        chunks = state.get("retrieved_chunks", [])
        if not chunks:
            # No retrieval → genuine unknown, force escalate path.
            log.warning("generate.stub_no_chunks", ticket_id=state.get("ticket_id"))
            return {
                "answer": "",
                "confidence": 0.0,                 # triggers escalate downstream
                "cited_chunks": [],
                "status": "answered",
            }

        stub_answer = (
            "Based on our knowledge base: "
            + chunks[0].get("body", "No relevant article found.")
        )
        stub_confidence = float(chunks[0].get("score", 0.70))
        log.warning("generate.stub_mode", confidence=stub_confidence)
        return {
            "answer": stub_answer,
            "confidence": stub_confidence,
            "cited_chunks": [chunks[0].get("id", "kb-stub-1")],
            "status": "answered",
        }

    # ─── REAL: delegated to services.gemini.ground_and_answer ────────
    # (Wired in phase 3.)
    from ...services.gemini import ground_and_answer

    parsed: AnswerWithConfidence = await ground_and_answer(
        query=state["text"],
        chunks=state["retrieved_chunks"],
    )
    return {
        "answer": parsed.answer,
        "confidence": parsed.confidence,
        "cited_chunks": parsed.cited_chunks,
        "status": "answered",
    }
