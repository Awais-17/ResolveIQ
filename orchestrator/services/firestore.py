"""services.firestore — Firebase Admin async Firestore writes + ledger queries.

Phase 5 wiring. All functions are async and use the
`firebase_admin.firestore_async` client (a thin wrapper over
`google-cloud-firestore.AsyncClient`), which authenticates via
Application Default Credentials on Cloud Run.

Why the Admin SDK: it bypasses Firestore Security Rules, so Cloud Run
writes/reads are gated by IAM (the service account must have
`roles/datastore.user`) — making the rules file's `allow write: if false`
safe (UI clients write only via the orchestrator + Cloud Functions).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from google.cloud import firestore  # SERVER_TIMESTAMP sentinel + AsyncClient

from ..config import get_settings

log = structlog.get_logger("resolveiq.firestore")
_settings = get_settings()


class NotImplementedStub(RuntimeError):
    pass


_db: Any | None = None


def _get_db():
    """Initialise the async Firestore client once per process."""
    global _db
    if _db is not None:
        return _db
    if not _settings.uses_real_firestore:
        raise NotImplementedStub("Firestore requested in stub mode")
    try:
        import firebase_admin
        from firebase_admin import firestore_async

        if not firebase_admin._apps:                              # noqa: SLF001
            firebase_admin.initialize_app(
                options={"projectId": _settings.firebase_project}
            )
        _db = firestore_async.client()
    except Exception:
        # Fall back to google.cloud.firestore.AsyncClient with anonymous creds for local dev
        from google.auth.credentials import AnonymousCredentials
        from google.cloud import firestore as google_firestore
        _db = google_firestore.AsyncClient(
            project=_settings.firebase_project,
            credentials=AnonymousCredentials(),
        )
    return _db


import json
import os
import httpx


async def _write_ticket_via_rest(ticket_id: str, payload: dict[str, Any]) -> bool:
    project_id = _settings.firebase_project or "resolveiq-demo"
    api_key = (
        os.getenv("FIREBASE_API_KEY")
        or os.getenv("VITE_FIREBASE_API_KEY")
        or "AIzaSyA1iE3TCa9cP9o10MCZW0r07rcYkjH8W7s"
    )

    fields = {}
    mask_fields = []
    for k, v in payload.items():
        if v is None:
            continue
        mask_fields.append(k)
        if isinstance(v, str):
            fields[k] = {"stringValue": v}
        elif isinstance(v, bool):
            fields[k] = {"booleanValue": v}
        elif isinstance(v, (int, float)):
            fields[k] = {"doubleValue": float(v)}
        elif isinstance(v, list):
            fields[k] = {"arrayValue": {"values": [{"stringValue": str(x)} for x in v]}}
        elif isinstance(v, dict):
            fields[k] = {"stringValue": json.dumps(v)}

    if not fields:
        return True

    query_params = "&".join([f"updateMask.fieldPaths={f}" for f in mask_fields])
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/tickets/{ticket_id}?key={api_key}&{query_params}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.patch(url, json={"fields": fields})
            if resp.is_success:
                log.info("firestore.rest_write_success", ticket_id=ticket_id)
                return True
            log.warning("firestore.rest_write_status", ticket_id=ticket_id, status=resp.status_code, text=resp.text[:200])
    except Exception as exc:
        log.warning("firestore.rest_write_exception", ticket_id=ticket_id, error=str(exc))
    return False


async def write_ticket(ticket_id: str, payload: dict[str, Any]) -> None:
    """Merge UPSERT a ticket doc by id into `tickets/{ticket_id}`."""
    try:
        db = _get_db()
        ref = db.collection("tickets").document(ticket_id)
        payload_with_ts = {**payload, "updatedAt": firestore.SERVER_TIMESTAMP}
        await ref.set(payload_with_ts, merge=True)
        log.info("firestore.ticket_written", ticket_id=ticket_id, keys=list(payload.keys()))
    except Exception as exc:
        log.warning("firestore.admin_sdk_failed_trying_rest", ticket_id=ticket_id, error=str(exc))
        await _write_ticket_via_rest(ticket_id, payload)


async def get_ticket(ticket_id: str) -> dict[str, Any] | None:
    db = _get_db()
    ref = db.collection("tickets").document(ticket_id)
    snap = await ref.get()
    return snap.to_dict() if snap.exists else None


# ─── Recent-tickets ledger (used by the dedup node) ───────────────


async def query_recent_tickets(*, channel: str | None, limit: int, minutes: int) -> list[dict]:
    """Return recent tickets (optionally per channel) within `minutes` window."""
    db = _get_db()
    q = db.collection("tickets").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)
    if channel:
        q = q.where(filter=firestore.FieldFilter("channel", "==", channel))
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    snaps = await q.get()

    recent = []
    for s in snaps:
        data = s.to_dict() or {}
        created_at = data.get("createdAt")
        if created_at is None:
            dt = datetime.now(timezone.utc)
        elif hasattr(created_at, "to_datetime"):
            dt = created_at.to_datetime()
        elif isinstance(created_at, datetime):
            dt = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        if dt >= cutoff:
            recent.append({**data, "id": s.id})
    return recent


async def write_ticket_ledger(
    *, ticket_id: str, channel: str, text: str, embedding: list[float], cluster_id: str, answer: str | None = None
) -> None:
    """Upsert the ticket itself as the ledger row (acts as both record and dedup source of truth)."""
    db = _get_db()
    ref = db.collection("tickets").document(ticket_id)
    await ref.set(
        {
            "channel": channel,
            "text": text,
            "embedding": embedding,
            "cluster_id": cluster_id,
            "answer": answer or "",
            "createdAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )


# ─── KB articles (self-learning) ────────────────────────────────────


async def write_kb_article(article, source_ticket_id: str | None) -> str:
    """Persist a new KB article to Firestore, return its id."""
    db = _get_db()
    ref = db.collection("kb_articles").document()
    doc = {
        "title": article.title,
        "body": article.body,
        "tags": list(article.tags),
        "summary": article.summary,
        "source_ticket_id": source_ticket_id,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }
    await ref.set(doc)
    log.info("firestore.kb_article_written", kb_article_id=ref.id, title=article.title)
    return ref.id


# ─── Incident clusters ─────────────────────────────────────────────


async def upsert_incident_cluster(
    *, cluster_id: str, ticket_id: str, summary: str,
    suspected_root_cause: str | None, root_cause_confidence: float | None,
) -> None:
    db = _get_db()
    ref = db.collection("incident_clusters").document(cluster_id)
    await ref.set(
        {
            "first_seen": firestore.SERVER_TIMESTAMP,
            "status": "active",
            "summary": summary,
            "suspected_root_cause": suspected_root_cause,
            "root_cause_confidence": root_cause_confidence,
        },
        merge=True,
    )
    await ref.update({"ticket_ids": firestore.ArrayUnion([ticket_id]), "ticket_count": firestore.Increment(1)})
    log.info("firestore.incident_cluster_upserted", cluster_id=cluster_id)
