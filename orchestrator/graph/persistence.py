"""persistence — Firestore-backed state store (real mode) + ledger for dedup.

Phase 2 ships a thin no-op stub so the graph imports cleanly. Real writes
are wired in phase 5 (`services/firestore.py`). All functions are async
so the call sites in the nodes never need to change between phases.
"""
from __future__ import annotations

from typing import Any

from ..config import get_settings

_settings = get_settings()


# Each function below switches on `_settings.uses_real_firestore`. The real
# mode body is imported lazily (so the module can still be loaded in stub
# mode without the firebase_admin import shedding warnings).


async def write_ticket(ticket_id: str, payload: dict[str, Any]) -> None:
    """Merge UPSERT a ticket doc by id into `tickets/{ticket_id}`."""
    if not _settings.uses_real_firestore:
        return
    from ..services.firestore import write_ticket as _real
    await _real(ticket_id, payload)


async def write_kb_article(article, source_ticket_id: str | None) -> str | None:
    if not _settings.uses_real_firestore:
        return None
    from ..services.firestore import write_kb_article as _real
    return await _real(article=article, source_ticket_id=source_ticket_id)


async def query_recent_tickets(*, channel: str | None, limit: int, minutes: int) -> list[dict]:
    """Return recent tickets (optionally per channel) within `minutes` window."""
    if not _settings.uses_real_firestore:
        return []
    from ..services.firestore import query_recent_tickets as _real
    return await _real(channel=channel, limit=limit, minutes=minutes)


async def write_ticket_ledger(
    *, ticket_id: str, channel: str, text: str, embedding: list[float], cluster_id: str, answer: str | None = None
) -> None:
    """Upsert a row in the recent-tickets ledger used by the dedup node."""
    if not _settings.uses_real_firestore:
        return
    from ..services.firestore import write_ticket_ledger as _real
    await _real(
        ticket_id=ticket_id,
        channel=channel,
        text=text,
        embedding=embedding,
        cluster_id=cluster_id,
        answer=answer,
    )
