"""kb_update — self-learning knowledge base.

Triggered by `POST /tickets/{id}/resolve` (a dashboard action by a human
agent). Summarizes the Q&A into a clean KB article, writes it to the
Firestore `kb_articles` collection, and (in real mode) pushes the
article into the Vertex AI Search index for future grounding.
"""
from __future__ import annotations

from datetime import datetime, timezone

import structlog

from ..state import KBArticleDraft, SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.kb_update")
_settings = get_settings()


async def kb_update_node(state: SupportTicketState) -> dict:
    log.info("kb_update.start", ticket_id=state.get("ticket_id"))

    # Build the article text from the prior ticket state — resolution_text typed by human takes priority!
    q = state.get("text", "")
    a = state.get("resolution_text") or state.get("answer") or state.get("drafted_reply") or ""

    if not _settings.uses_real_ai:
        # ─── STUB: deterministic article for offline validation ────
        article = KBArticleDraft(
            title=f"Resolution: {q[:60]}{'…' if len(q) > 60 else ''}",
            body=a,
            tags=["resolved-escalation", state.get("channel", "unknown")],
            summary=a[:150],
        )
        log.warning("kb_update.stub_mode", title=article.title)
    else:
        # ─── REAL: Gemini summarization (phase 8) ───────────────────
        from ...services.gemini import summarize_resolution
        article = await summarize_resolution(question=q, resolution=a)
        if not article.body or len(article.body.strip()) < 5:
            article = KBArticleDraft(
                title=f"Resolution for: {q[:50]}",
                body=a,
                tags=["self-learned"],
                summary=a[:150],
            )

    kb_article_id = None
    if _settings.uses_real_firestore:
        from ..persistence import write_kb_article, write_ticket
        kb_article_id = await write_kb_article(
            article=article,
            source_ticket_id=state.get("ticket_id"),
        )
        if state.get("ticket_id"):
            await write_ticket(
                ticket_id=state["ticket_id"],
                payload={
                    "status": "human_resolved",
                    "resolution_text": a,
                    "answer": a,
                    "kb_article_id": kb_article_id,
                },
            )

    if not kb_article_id:
        kb_article_id = f"kb_dyn_{state.get('ticket_id', 'local')}"

    # Push the new article into the RAG index so the same question is auto-resolved next time.
    from ...services.rag import index_kb_article
    await index_kb_article(article_id=kb_article_id, article=article)

    # Push to BigQuery
    from ...services.bigquery import stream_ticket_to_bq
    import asyncio
    asyncio.create_task(stream_ticket_to_bq(state))

    return {
        "status": "human_resolved",
        "kb_article_id": kb_article_id,
    }
