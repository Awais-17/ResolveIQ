"""ResolveIQ orchestrator — FastAPI entrypoint.

Endpoints
- GET  /healthz                liveness + capability flags
- POST /tickets                ingest a normalized ticket → run the graph
- POST /tickets/{id}/resolve   human-resolution trigger → kb_update node
"""
from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .graph.builder import get_graph, get_resolution_graph
from .graph.state import (
    HealthResponse,
    OrchestratorResponse,
    ResolveRequest,
    ResolveResponse,
    SupportTicketState,
    TicketIn,
)

_settings = get_settings()
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}.get(_settings.log_level, 20)
    ),
)
log = structlog.get_logger("resolveiq")


async def auto_process_pending_tickets():
    """Background task: continuously watch Firestore for pending tickets and process them automatically."""
    log.info("background_worker.started")
    while True:
        try:
            await asyncio.sleep(2)
            if not _settings.uses_real_firestore:
                continue
            from .services.firestore import _get_db
            try:
                db = _get_db()
            except Exception:
                continue

            snaps = await db.collection("tickets").where("status", "==", "pending").limit(10).get()
            for doc in snaps:
                ticket_data = doc.to_dict() or {}
                ticket_id = doc.id
                text = ticket_data.get("text", "")
                if not text:
                    continue
                log.info("background_worker.processing_pending", ticket_id=ticket_id, text=text[:30])
                # Mark status processing to prevent re-pickup
                await doc.reference.set({"status": "processing"}, merge=True)

                initial_state: SupportTicketState = {
                    "ticket_id": ticket_id,
                    "channel": ticket_data.get("channel", "chat"),
                    "user_id": ticket_data.get("user_id", "u_friend_demo"),
                    "text": text,
                    "timestamp": datetime.now(timezone.utc),
                }
                try:
                    graph = get_graph()
                    await graph.ainvoke(initial_state)
                    log.info("background_worker.processed_success", ticket_id=ticket_id)
                except Exception as exc:
                    log.exception("background_worker.processing_failed", ticket_id=ticket_id, error=str(exc))
                    await doc.reference.set({"status": "escalated"}, merge=True)
        except asyncio.CancelledError:
            break
        except Exception as err:
            log.warning("background_worker.error", error=str(err))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Eagerly compile the graph so the first request is fast.
    log.info(
        "startup",
        model=_settings.gemini_model,
        stub_mode=_settings.stub_mode,
        real_ai=_settings.uses_real_ai,
        real_rag=_settings.uses_real_rag,
        real_firestore=_settings.uses_real_firestore,
    )
    get_graph()
    get_resolution_graph()
    log.info("startup.graph_compiled")
    worker_task = asyncio.create_task(auto_process_pending_tickets())
    yield
    worker_task.cancel()
    log.info("shutdown")


app = FastAPI(
    title="ResolveIQ Orchestrator",
    version="0.1.0",
    description="LangGraph + Vertex AI powered customer-support agent",
    lifespan=lifespan,
)

# Allow the React dashboard (Vite dev server on :5173 or Firebase Hosting)
# to call the orchestrator API directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _log_requests(request, call_next):
    log.debug("http.request", path=request.url.path, method=request.method)
    response = await call_next(request)
    return response


@app.get("/")
async def root():
    return {
        "service": "ResolveIQ Orchestrator API",
        "status": "online",
        "health_check": "/healthz",
        "documentation": "/docs",
    }


@app.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(
        status="stub" if _settings.stub_mode else ("degraded" if not _settings.uses_real_ai else "ok"),
        stub_mode=_settings.stub_mode,
        uses_real_ai=_settings.uses_real_ai,
        uses_real_rag=_settings.uses_real_rag,
        uses_real_firestore=_settings.uses_real_firestore,
    )


@app.post("/tickets", response_model=OrchestratorResponse)
async def ingest_ticket(ticket: TicketIn) -> OrchestratorResponse:
    """Ingest a normalized ticket and run the full agent graph synchronously."""
    if not ticket.ticket_id:
        ticket.ticket_id = f"tkt_{uuid.uuid4().hex[:10]}"
    log.info("tickets.ingest", ticket_id=ticket.ticket_id, channel=ticket.channel)

    initial_state: SupportTicketState = {
        "ticket_id": ticket.ticket_id,
        "channel": ticket.channel,
        "user_id": ticket.user_id,
        "text": ticket.text,
        "timestamp": ticket.timestamp or datetime.now(timezone.utc),
    }

    try:
        graph = get_graph()
        final_state = await graph.ainvoke(initial_state)
    except Exception as exc:                              # noqa: BLE001
        log.exception("tickets.graph_failed", ticket_id=ticket.ticket_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Graph execution failed: {exc}") from exc

    return OrchestratorResponse(
        ticket_id=final_state.get("ticket_id", ticket.ticket_id),
        status=final_state.get("status", "escalated"),
        answer=final_state.get("answer"),
        confidence=final_state.get("confidence"),
        cited_chunks=final_state.get("cited_chunks"),
        cluster_id=final_state.get("cluster_id"),
        cluster_size=final_state.get("cluster_size"),
        suspected_root_cause=final_state.get("suspected_root_cause"),
        root_cause_confidence=final_state.get("root_cause_confidence"),
        drafted_reply=final_state.get("drafted_reply"),
    )


@app.post("/tickets/{ticket_id}/resolve", response_model=ResolveResponse)
async def resolve_ticket(ticket_id: str, body: ResolveRequest) -> ResolveResponse:
    """Mark an escalated ticket resolved and trigger KB self-update.

    The dashboard posts the agent's resolution text here. The
    kb_update node summarizes the Q&A into a new KB article and (in
    real mode) re-indexes it into the Vertex AI Search datastore.
    """
    log.info("tickets.resolve", ticket_id=ticket_id, agent_id=body.agent_id)

    question_text = body.resolution_text
    if _settings.uses_real_firestore:
        try:
            from .services.firestore import get_ticket
            t = await get_ticket(ticket_id)
            if t and t.get("text"):
                question_text = t["text"]
        except Exception:
            pass

    prior_state: SupportTicketState = {
        "ticket_id": ticket_id,
        "text": question_text,
        "drafted_reply": None,
        "resolution_text": body.resolution_text,
    }

    try:
        graph = get_resolution_graph()
        final_state = await graph.ainvoke(prior_state)
    except Exception as exc:                              # noqa: BLE001
        log.exception("tickets.resolve_failed", ticket_id=ticket_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"KB update failed: {exc}") from exc

    return ResolveResponse(
        ticket_id=ticket_id,
        status=final_state.get("status", "human_resolved"),
        kb_article_id=final_state.get("kb_article_id"),
    )


@app.delete("/kb_articles/{article_id}")
async def delete_kb_article_endpoint(article_id: str):
    """Delete a KB article from Firestore and local RAG memory."""
    log.info("kb_articles.delete_requested", article_id=article_id)
    
    # Remove from local in-memory RAG
    from .services.rag import remove_kb_article
    await remove_kb_article(article_id=article_id)
    
    # Remove from Firestore
    if _settings.uses_real_firestore:
        try:
            from .services.firestore import delete_kb_article
            success = await delete_kb_article(article_id)
            if not success:
                raise HTTPException(status_code=500, detail="Failed to delete from Firestore")
        except Exception as exc:
            log.exception("kb_articles.delete_failed", article_id=article_id, error=str(exc))
            raise HTTPException(status_code=500, detail=f"Delete failed: {exc}") from exc
            
    return {"status": "deleted", "article_id": article_id}


if __name__ == "__main__":
    # Allow `python -m orchestrator.main` for local dev convenience.
    import uvicorn

    uvicorn.run(
        "orchestrator.main:app",
        host=_settings.host,
        port=_settings.port,
        reload=False,
        log_level=_settings.log_level.lower(),
    )
