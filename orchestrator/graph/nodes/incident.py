"""incident — root-cause linking.

If cluster_size >= INCIDENT_TICKET_THRESHOLD (default 3), look up the
cluster in the changelog datastore and ask Gemini for the most likely
root cause. Phase 2 STUB emits a canned root cause + writes an incident
record so dashboards can render the card.
"""
from __future__ import annotations

import structlog

from ..state import SupportTicketState
from ...config import get_settings

log = structlog.get_logger("resolveiq.incident")
_settings = get_settings()


async def incident_node(state: SupportTicketState) -> dict:
    cluster_size = state.get("cluster_size", 0)
    log.info("incident.start", ticket_id=state.get("ticket_id"), cluster_size=cluster_size)

    if cluster_size < _settings.incident_ticket_threshold:
        # Not yet an incident — pass through unchanged.
        return {}

    if not _settings.uses_real_ai:
        # ─── STUB ──────────────────────────────────────────────────
        suspected = (
            "Likely related to deploy `release-2026.08.05-r3` (file-upload "
            "service switched to new multipart encoder) shipped at 09:42 UTC."
        )
        log.warning("incident.stub_mode", suspected=suspected)
        return {
            "suspected_root_cause": suspected,
            "root_cause_confidence": 0.61,
            "status": "incident_flagged",
        }

    # ─── REAL: changelog datastore + root-cause prompt (phase 4) ─────
    from ...services.rag import retrieve_changelog
    from ...services.gemini import reason_about_root_cause
    from ..analyst_agent import invoke_analyst_agent

    recent_changes = await retrieve_changelog(
        query=state.get("text", ""),
        top_k=5,
    )
    suspected, conf = await reason_about_root_cause(
        cluster_text=state.get("cluster_representative") or state.get("text", ""),
        cluster_size=cluster_size,
        changelog_chunks=recent_changes,
    )

    # A2A Handoff: Ask Analyst Agent for an impact report
    impact_report = await invoke_analyst_agent(
        incident_summary=state.get("cluster_representative") or state.get("text", ""),
        root_cause=suspected
    )
    
    final_root_cause = f"{suspected}\n\n[Analyst Agent Report]: {impact_report}"

    return {
        "suspected_root_cause": final_root_cause,
        "root_cause_confidence": conf,
        "status": "incident_flagged",
    }
