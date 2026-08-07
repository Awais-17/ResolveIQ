"""MCP Server for ResolveIQ.

Exposes the Knowledge Base and Support Tickets via the Model Context Protocol (MCP)
so that external LLMs and evaluators can seamlessly query the support context.
"""
from mcp.server.fastmcp import FastMCP
import os
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize FastMCP Server
mcp = FastMCP("ResolveIQ_MCP")

# Initialize Firebase (assuming default credentials or service account for the hackathon)
if not firebase_admin._apps:
    try:
        firebase_admin.initialize_app()
    except Exception:
        pass # Handle gracefully if run without creds

def get_db():
    try:
        return firestore.client()
    except Exception:
        return None

@mcp.tool()
def get_kb_article(title: str) -> str:
    """Retrieve a Knowledge Base article by title."""
    db = get_db()
    if not db:
        return "Error: Database not connected."
    
    docs = db.collection("kb_articles").where("title", "==", title).limit(1).stream()
    for doc in docs:
        data = doc.to_dict()
        return f"Title: {data.get('title')}\n\n{data.get('body')}"
    
    return "Article not found."

@mcp.tool()
def get_active_incidents() -> str:
    """Retrieve a summary of all currently active support incidents."""
    db = get_db()
    if not db:
        return "Error: Database not connected."
    
    docs = db.collection("incident_clusters").where("status", "==", "active").stream()
    incidents = []
    for doc in docs:
        data = doc.to_dict()
        incidents.append(f"Incident: {data.get('summary')} (Root Cause: {data.get('suspected_root_cause', 'Unknown')})")
    
    if not incidents:
        return "No active incidents."
    return "\n".join(incidents)

if __name__ == "__main__":
    # Run the server on standard IO (MCP default)
    mcp.run()
