"""Graph builder — wires all nodes into a LangGraph StateGraph.

Deterministic 7-node topology (see ARCHITECTURE.md §2):
    START → intake → retrieve → generate → dedup → route
                                                   ├ incident ─→ route2
                                                   ├ auto_resolve → END
                                                   └ escalate → END
"""
from __future__ import annotations

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from .nodes import (  # noqa: F401 — imported for graph wiring
    auto_resolve,
    dedup,
    escalate,
    generate,
    incident,
    intake,
    kb_update,
    retrieve,
)
from .state import SupportTicketState
from ..config import get_settings

_settings = get_settings()


# ─── Routing functions (pure, sync — no LLM calls) ──────────────────
def route_after_answer(state: SupportTicketState) -> str:
    """Branch on cluster size + confidence."""
    if state.get("cluster_size", 0) >= _settings.incident_ticket_threshold:
        # If we have NOT yet flagged the incident, route to incident node
        # first. If the incident has already run for this ticket, fall
        # through to the resolve/escalate branch on confidence.
        if state.get("status") != "incident_flagged":
            return "incident"
    if (state.get("confidence") or 0.0) >= _settings.confidence_threshold:
        return "auto_resolve"
    return "escalate"


def route_after_incident(state: SupportTicketState) -> str:
    """After incident node, still pick auto_resolve vs escalate for THIS ticket."""
    if (state.get("confidence") or 0.0) >= _settings.confidence_threshold:
        return "auto_resolve"
    return "escalate"


def build_compile_graph():
    """Build and compile the StateGraph. Cached so we compile once per process."""
    builder = StateGraph(SupportTicketState)

    # ─ Nodes ─
    builder.add_node("intake",       intake.intake_node)
    builder.add_node("retrieve",      retrieve.retrieve_node)
    builder.add_node("generate",      generate.generate_node)
    builder.add_node("dedup",         dedup.dedup_node)
    builder.add_node("incident",     incident.incident_node)
    builder.add_node("auto_resolve",  auto_resolve.auto_resolve_node)
    builder.add_node("escalate",     escalate.escalate_node)

    # ─ Edges ─
    builder.add_edge(START, "intake")
    builder.add_edge("intake", "retrieve")
    builder.add_edge("retrieve", "generate")
    builder.add_edge("generate", "dedup")

    builder.add_conditional_edges(
        "dedup",
        route_after_answer,
        {
            "incident": "incident",
            "auto_resolve": "auto_resolve",
            "escalate": "escalate",
        },
    )
    builder.add_conditional_edges(
        "incident",
        route_after_incident,
        {
            "auto_resolve": "auto_resolve",
            "escalate": "escalate",
        },
    )
    builder.add_edge("auto_resolve", END)
    builder.add_edge("escalate", END)

    # In real mode we'd attach `checkpointer=FirestoreSaver(...)` here, but
    # phase 2 stays un-checkpointed. Phase 5 wires the checkpointer.
    return builder.compile()


@lru_cache(maxsize=1)
def get_graph():
    """Singleton compiled graph reused across requests (lifespan-friendly)."""
    return build_compile_graph()


def get_resolution_graph():
    """A subordinate graph run on `POST /tickets/{id}/resolve`.

    For phase 2 this is just the `kb_update` node (a single-step graph).
    Phase 8 may expand it to retrieve any conflicting articles and merge.
    """
    builder = StateGraph(SupportTicketState)
    builder.add_node("kb_update", kb_update.kb_update_node)
    builder.add_edge(START, "kb_update")
    builder.add_edge("kb_update", END)
    return builder.compile()
