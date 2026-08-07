"""SupportTicketState — internal LangGraph state + Pydantic I/O boundary models.

Per the build plan §2:
- TypedDict for internal graph state (cheap checkpointing).
- Pydantic at I/O boundaries (HTTP body, Gemini structured output).
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


# ─── Reducer for accumulated chunks: append rather than overwrite ─────
def extend_chunks(left: list | None, right: list | None) -> list:
    return (left or []) + (right or [])


# ─── Channel union (consistent with dashboard simulated channels) ────
Channel = Literal["chat", "email", "slack", "portal"]
TicketStatus = Literal[
    "new",
    "retrieved",
    "answered",
    "clustered",
    "incident_flagged",
    "auto_resolved",
    "escalated",
    "human_resolved",
]


class SupportTicketState(TypedDict, total=False):
    """The graph state passed between nodes.

    Not all fields are populated at every step; only the keys a node writes
    are merged back into shared state by LangGraph's reducer logic.
    """

    # ── Inbound (set by intake node from TicketIn) ─────────────────
    ticket_id: str
    channel: Channel
    user_id: str
    text: str
    timestamp: datetime
    embedding: Optional[list[float]]
    sentiment: Optional[str]
    is_safe: Optional[bool]
    security_reason: Optional[str]

    # ── Retrieval / generation outputs ─────────────────────────────
    retrieved_chunks: Annotated[list[dict], extend_chunks]
    answer: str
    confidence: float                                  # 0.0..1.0
    cited_chunks: list[str]

    # ── Cross-channel clustering ─────────────────────────────────
    cluster_id: Optional[str]
    cluster_size: int
    cluster_representative: Optional[str]              # text of the first-seen ticket in cluster

    # ── Incident intelligence ─────────────────────────────────────
    suspected_root_cause: Optional[str]
    root_cause_confidence: Optional[float]

    # ── Lifecycle ─────────────────────────────────────────────────
    status: TicketStatus
    drafted_reply: Optional[str]
    resolution_text: Optional[str]
    human_context_bundle: Optional[dict]
    kb_article_id: Optional[str]
    error: Optional[str]


# ─── Pydantic models at I/O boundaries ──────────────────────────────


class TicketIn(BaseModel):
    """HTTP body received by `POST /tickets`."""

    ticket_id: Optional[str] = None                    # auto-assigned if absent
    channel: Channel
    user_id: str
    text: str
    timestamp: Optional[datetime] = None                # defaults to server now() in intake

    class Config:
        json_schema_extra = {
            "example": {
                "ticket_id": "tkt_1",
                "channel": "chat",
                "user_id": "u_1",
                "text": "Upload to cloud storage keeps failing with a 504 error",
                "timestamp": "2026-08-06T10:00:00Z",
            }
        }


class AnswerWithConfidence(BaseModel):
    """Gemini structured output for the `generate` node."""

    answer: str = Field(..., description="Grounded answer to the user's question, derived strictly from the provided KB chunks.")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated confidence 0..1. Lower if KB chunks are weak or only suggest direction.")
    cited_chunks: list[str] = Field(default_factory=list, description="Ids or titles of chunks cited in the answer.")


class KBArticleDraft(BaseModel):
    """Gemini structured output for the `kb_update` node (self-learning)."""

    title: str = Field(..., description="Short article title, e.g., 'Resolving 504 errors on cloud-storage uploads'.")
    body: str = Field(..., description="A concise yet complete KB article body in Markdown.")
    tags: list[str] = Field(default_factory=list, description="Indexing tags, e.g., ['upload','504','storage'].")
    summary: str = Field(..., description="1-2 sentence summary for the dashboard.")


class ResolveRequest(BaseModel):
    """HTTP body received by `POST /tickets/{id}/resolve` (human resolution trigger)."""

    resolution_text: str = Field(..., description="What the agent did to resolve the ticket.")
    applied_draft: Optional[bool] = Field(
        default=False,
        description="Whether the agent sent the canned draft reply as-is.",
    )
    agent_id: str = Field(..., description="The agent's identifier (.Firebase Auth uid).")


class OrchestratorResponse(BaseModel):
    """HTTP body returned by POST /tickets."""

    ticket_id: str
    status: TicketStatus
    answer: Optional[str] = None
    confidence: Optional[float] = None
    cited_chunks: Optional[list[str]] = None
    cluster_id: Optional[str] = None
    cluster_size: Optional[int] = None
    suspected_root_cause: Optional[str] = None
    root_cause_confidence: Optional[float] = None
    drafted_reply: Optional[str] = None


class ResolveResponse(BaseModel):
    """HTTP body returned by POST /tickets/{id}/resolve."""

    ticket_id: str
    status: TicketStatus
    kb_article_id: Optional[str] = None
    kb_article: Optional[KBArticleDraft] = None


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "stub"]
    service: str = "resolveiq-orchestrator"
    version: str = "0.1.0"
    stub_mode: bool = False
    uses_real_ai: bool = False
    uses_real_rag: bool = False
    uses_real_firestore: bool = False
