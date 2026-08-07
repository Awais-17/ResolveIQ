"""analyst_agent.py — Secondary Agent for Agent-to-Agent (A2A) communication.

This module defines a separate LangGraph agent used exclusively for analyzing 
incidents by querying historical patterns or generating an impact report.
The primary SupportAgent invokes this AnalystAgent dynamically (A2A).
"""
import structlog
from typing_extensions import TypedDict
from langgraph.graph import StateGraph, END

log = structlog.get_logger("resolveiq.analyst_agent")

class AnalystState(TypedDict):
    incident_summary: str
    root_cause: str
    impact_report: str | None

def analyze_impact(state: AnalystState) -> dict:
    log.info("analyst_agent.analyzing", root_cause=state["root_cause"])
    # In a real app, this node would query BigQuery or Prometheus to gauge impact
    report = f"Based on '{state['root_cause']}', estimated user impact is high. Suggest prioritizing fix."
    return {"impact_report": report}

# Build the simple secondary graph
builder = StateGraph(AnalystState)
builder.add_node("analyze", analyze_impact)
builder.set_entry_point("analyze")
builder.add_edge("analyze", END)

analyst_agent_graph = builder.compile()

async def invoke_analyst_agent(incident_summary: str, root_cause: str) -> str:
    """Invokes the secondary analyst agent."""
    log.info("a2a.hand_off", agent="AnalystAgent")
    result = await analyst_agent_graph.ainvoke({
        "incident_summary": incident_summary,
        "root_cause": root_cause,
        "impact_report": None
    })
    return result["impact_report"]
