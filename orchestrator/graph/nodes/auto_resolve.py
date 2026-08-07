"""auto_resolve — confident answers ship to the customer immediately.

Writes the resolved ticket back to Firestore (real mode) and returns the
summary that FastAPI hands back to the channel simulator / dashboard.
"""
from __future__ import annotations

import structlog

from ..state import SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.auto_resolve")
_settings = get_settings()


async def auto_resolve_node(state: SupportTicketState) -> dict:
    log.info(
        "auto_resolve.success",
        ticket_id=state.get("ticket_id"),
        confidence=state.get("confidence"),
        cited_chunks=state.get("cited_chunks"),
    )

    final_status = "auto_resolved"

    if not _settings.uses_real_firestore:
        return {
            "status": final_status,
            "answer": state.get("answer", ""),
            "drafted_reply": None,
        }

    # ─── REAL: write to Firestore (phase 5) ────────────────────────
    from ..persistence import write_ticket

    await write_ticket(
        ticket_id=state["ticket_id"],
        payload={
            "status": final_status,
            "answer": state.get("answer", ""),
            "confidence_score": state.get("confidence", 0.0),
            "matched_kb_ids": state.get("cited_chunks", []),
            "cluster_id": state.get("cluster_id"),
            "drafted_reply": None,
            "suspected_root_cause": state.get("suspected_root_cause"),
            "root_cause_confidence": state.get("root_cause_confidence"),
        },
    )
    
    # Push to BigQuery
    from ...services.bigquery import stream_ticket_to_bq
    import asyncio
    
    # We could `await` it directly, but for performance, we could create a task. 
    # For simplicity and to ensure it runs, we'll just await it or fire-and-forget.
    asyncio.create_task(stream_ticket_to_bq(state))

    return {"status": final_status}
