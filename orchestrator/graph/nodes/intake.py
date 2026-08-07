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
from ...services.security import scan_prompt_injection

log = structlog.get_logger("resolveiq.intake")

async def intake_node(state: SupportTicketState) -> dict:  # noqa: D401
    query_text = state.get("text", "")
    log.info(
        "intake.received",
        ticket_id=state.get("ticket_id"),
        channel=state.get("channel"),
        user_id=state.get("user_id"),
        text_len=len(query_text),
    )
    ts = state.get("timestamp") or datetime.now(timezone.utc)
    
    # Prompt injection & input guardrail scan
    sec_result = scan_prompt_injection(query_text)
    if not sec_result.is_safe:
        log.warning("intake.security_blocked", reason=sec_result.reason)

    # Gemma sentiment analysis
    sentiment = await analyze_sentiment(query_text)
    log.info("intake.sentiment", sentiment=sentiment)

    return {
        "timestamp": ts,
        "status": "new" if sec_result.is_safe else "escalated",
        "is_safe": sec_result.is_safe,
        "security_reason": sec_result.reason,
        "text": sec_result.sanitized_text if sec_result.is_safe else query_text,
        "embedding": None,                 # populated lazily by dedup node
        "sentiment": sentiment,
        "cited_chunks": [],
        "retrieved_chunks": [],
    }
