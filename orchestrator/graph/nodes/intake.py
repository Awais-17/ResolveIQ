"""intake — first node.

Normalizes the inbound ticket. If `timestamp` was not supplied by the
client (channel simulators always should), default it to server now().
Cache the embedding on state (or schedule its lazy production in dedup).
"""
from __future__ import annotations

from datetime import datetime, timezone
import structlog
from ..state import SupportTicketState
from ...services.gemma import analyze_sentiment

log = structlog.get_logger("resolveiq.intake")

async def intake_node(state: SupportTicketState) -> dict:  # noqa: D401
    log.info(
        "intake.received",
        ticket_id=state.get("ticket_id"),
        channel=state.get("channel"),
        user_id=state.get("user_id"),
        text_len=len(state.get("text", "")),
    )
    ts = state.get("timestamp") or datetime.now(timezone.utc)
    
    # Gemma sentiment analysis
    sentiment = await analyze_sentiment(state.get("text", ""))
    log.info("intake.sentiment", sentiment=sentiment)

    return {
        "timestamp": ts,
        "status": "new",
        "embedding": None,                 # populated lazily by dedup node
        "sentiment": sentiment,
        "cited_chunks": [],
        "retrieved_chunks": [],
    }
