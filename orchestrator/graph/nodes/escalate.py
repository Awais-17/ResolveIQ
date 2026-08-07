"""escalate — confidence < threshold branch.

Builds the context bundle for the human agent (original question +
retrieved chunks + partial reasoning + cluster_id if any) and drafts a
candidate reply using Gemini. The draft is editable in the dashboard
before send.
"""
from __future__ import annotations

import structlog

from ..state import SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.escalate")
_settings = get_settings()


async def escalate_node(state: SupportTicketState) -> dict:
    log.info(
        "escalate.routed",
        ticket_id=state.get("ticket_id"),
        confidence=state.get("confidence"),
        cluster_id=state.get("cluster_id"),
    )

    context_bundle = {
        "original_query": state.get("text", ""),
        "retrieved_chunks": state.get("retrieved_chunks", []),
        "partial_reasoning": state.get("answer", ""),
        "confidence": state.get("confidence", 0.0),
        "cluster_id": state.get("cluster_id"),
        "cluster_size": state.get("cluster_size"),
        "suspected_root_cause": state.get("suspected_root_cause"),
    }

    drafted_reply = ""

    if not _settings.uses_real_ai:
        drafted_reply = (
            f"Hi {state.get('user_id', 'there')},\n\n"
            "Thanks for reaching out — I've escalated your case to a specialist who "
            "will follow up shortly. What we know so far:\n\n"
            f"{state.get('answer', '(no preliminary answer)')}\n\n"
            "We'll update you as soon as we have a confirmed resolution."
        )
        log.warning("escalate.stub_draft", draft_len=len(drafted_reply))
    else:
        # ─── REAL: Gemini draft reply (phase 7) ──────────────────
        from ...services.gemini import draft_reply
        drafted_reply = await draft_reply(
            query=state.get("text", ""),
            chunks=state.get("retrieved_chunks", []),
            partial_reasoning=state.get("answer", ""),
        )

    ret = {
        "status": "escalated",
        "drafted_reply": drafted_reply,
        "human_context_bundle": context_bundle,
    }

    if _settings.uses_real_firestore:
        from ..persistence import write_ticket

        await write_ticket(
            ticket_id=state["ticket_id"],
            payload={
                "status": "escalated",
                "answer": state.get("answer", ""),
                "confidence_score": state.get("confidence", 0.0),
                "matched_kb_ids": state.get("cited_chunks", []),
                "cluster_id": state.get("cluster_id"),
                "drafted_reply": drafted_reply,
                "human_context_bundle": context_bundle,
            },
        )

    return ret
