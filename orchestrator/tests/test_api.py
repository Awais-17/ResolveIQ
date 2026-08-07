"""Integration tests for FastAPI endpoints.
"""
import pytest
from fastapi.testclient import TestClient
from orchestrator.main import app

client = TestClient(app)


def test_healthcheck_endpoint():
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "resolveiq-orchestrator"
    assert "status" in data


def test_ticket_ingestion_api():
    payload = {
        "channel": "chat",
        "user_id": "u_test_api",
        "text": "What are your Sunday opening hours?",
    }
    response = client.post("/tickets", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "ticket_id" in data
    assert "status" in data
