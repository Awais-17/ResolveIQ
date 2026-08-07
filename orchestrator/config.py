"""ResolveIQ orchestrator configuration.

All settings are read from environment variables (see project root `.env.example`),
with safe defaults so the service boots even without real credentials — at which
point the LangGraph skeleton runs in STUB mode (services raise NotImplementedStub)
so the graph topology can be exercised end-to-end offline during phase 2.
"""
from __future__ import annotations

import os
from pathlib import Path

# Auto-load the root .env so hybrid-mode flags (RESOLVEIQ_USE_REAL_GEMINI,
# GEMINI_API_KEY, FIREBASE_PROJECT_ID, etc.) are available to os.getenv().
from dotenv import load_dotenv

_repo_root = Path(__file__).resolve().parents[1]
load_dotenv(_repo_root / ".env", override=False)
from dataclasses import dataclass, field
from functools import lru_cache


def _env(key: str, default: str | None = None) -> str | None:
    val = os.getenv(key)
    return val if val is not None else default


def _env_float(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    # ─── Google Cloud / Vertex AI ───────────────────────────────
    google_project: str | None = field(default_factory=lambda: _env("GOOGLE_CLOUD_PROJECT"))
    google_location: str = field(default_factory=lambda: _env("GOOGLE_CLOUD_LOCATION", "global"))
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_temperature: float = field(default_factory=lambda: _env_float("GEMINI_TEMPERATURE", 0.0))
    gemini_max_retries: int = field(default_factory=lambda: _env_int("GEMINI_MAX_RETRIES", 2))
    embedding_model: str = field(default_factory=lambda: _env("EMBEDDING_MODEL", "gemini-embedding-001"))
    embedding_dims: int = field(default_factory=lambda: _env_int("EMBEDDING_DIMS", 768))

    # ─── Vertex AI Search datastores ────────────────────────────
    kb_datastore: str | None = field(default_factory=lambda: _env("VERTEX_AI_SEARCH_KB_DATASTORE"))
    changelog_datastore: str | None = field(default_factory=lambda: _env("VERTEX_AI_SEARCH_CHANGELOG_DATASTORE"))
    top_k: int = field(default_factory=lambda: _env_int("VERTEX_AI_SEARCH_TOP_K", 5))

    # ─── Decision thresholds (tunable at runtime by feedback loop) ─
    confidence_threshold: float = field(default_factory=lambda: _env_float("CONFIDENCE_THRESHOLD", 0.70))
    incident_ticket_threshold: int = field(default_factory=lambda: _env_int("INCIDENT_TICKET_THRESHOLD", 3))
    incident_window_minutes: int = field(default_factory=lambda: _env_int("INCIDENT_WINDOW_MINUTES", 20))
    dedup_sim_threshold: float = field(default_factory=lambda: _env_float("DEDUP_SIM_THRESHOLD", 0.85))
    recent_tickets_limit: int = field(default_factory=lambda: _env_int("RECENT_TICKETS_LEDGER_LIMIT", 50))

    # ─── Firebase ────────────────────────────────────────────────
    firebase_project: str | None = field(default_factory=lambda: _env("FIREBASE_PROJECT_ID") or _env("GOOGLE_CLOUD_PROJECT"))
    firestore_database: str = field(default_factory=lambda: _env("FIRESTORE_DATABASE", "(default)"))

    # ─── Server ──────────────────────────────────────────────────
    host: str = field(default_factory=lambda: _env("ORCHESTRATOR_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _env_int("ORCHESTRATOR_PORT", 8080))
    log_level: str = field(default_factory=lambda: _env("LOG_LEVEL", "INFO").upper())

    # ─── Operational flags ───────────────────────────────────────
    stub_mode: bool = field(default_factory=lambda: os.getenv("RESOLVEIQ_STUB_MODE", "0") == "1")
    use_real_gemini: bool | None = field(default_factory=lambda: (os.getenv("RESOLVEIQ_USE_REAL_GEMINI") == "1") if os.getenv("RESOLVEIQ_USE_REAL_GEMINI") is not None else None)
    use_real_firestore: bool | None = field(default_factory=lambda: (os.getenv("RESOLVEIQ_USE_REAL_FIRESTORE") == "1") if os.getenv("RESOLVEIQ_USE_REAL_FIRESTORE") is not None else None)
    use_real_rag: bool | None = field(default_factory=lambda: (os.getenv("RESOLVEIQ_USE_REAL_RAG") == "1") if os.getenv("RESOLVEIQ_USE_REAL_RAG") is not None else None)
    gemini_api_key: str | None = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    use_ai_studio_for_dedup: bool = field(default_factory=lambda: os.getenv("USE_AI_STUDIO_FOR_DEDUP", "1") == "1")

    @property
    def uses_real_ai(self) -> bool:
        """True if Gemini calls should go live."""
        if self.use_real_gemini is not None:
            return self.use_real_gemini
        if self.stub_mode:
            return False
        return bool(self.google_project or self.gemini_api_key or os.getenv("GEMINI_API_KEY"))

    @property
    def uses_real_firestore(self) -> bool:
        """True if real Firestore calls should be used."""
        if self.use_real_firestore is not None:
            return self.use_real_firestore
        if self.stub_mode:
            return False
        return self.firebase_project is not None

    @property
    def uses_real_rag(self) -> bool:
        """True if managed Vertex AI Search datastores should be used (False in local in-memory hybrid RAG)."""
        if self.use_real_rag is not None:
            return self.use_real_rag
        if self.stub_mode:
            return False
        return self.kb_datastore is not None and self.google_project is not None

    def data_path(self, datastore_id: str | None) -> str:
        """Full Vertex AI Search datastore resource path."""
        if not datastore_id:
            datastore_id = self.kb_datastore
        return f"projects/{self.google_project}/locations/global/collections/default_collection/dataStores/{datastore_id}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
