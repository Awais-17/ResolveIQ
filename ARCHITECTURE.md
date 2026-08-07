# ResolveIQ — Architecture & Implementation Plan

> AI Agent for Enterprise Customer Support Automation
> HiDevs AI House Builder Series · Problem Statement #5 · Author: Awais
> Stack: Google Cloud — Gemini 3.1 Pro (Vertex AI), Vertex AI Search, LangGraph, Firestore, Cloud Functions, Cloud Run, Firebase Hosting & Auth

This document is the synthesized implementation plan, derived from PRD + 2025/2026 API research. It is the **source of truth** for the build.

---

## 1. Tech Stack (Locked)

| Concern | Choice | Notes |
|---|---|---|
| AI model | `gemini-3.1-pro-preview` via Vertex AI `global` endpoint | Real model (Feb 2026 preview). Fallback: `gemini-2.5-pro`. **Verify exact ID in your GCP Model Garden before coding.** |
| Python SDK | `google-genai` (unified) + `langchain-google-genai` `ChatGoogleGenerativeAI(vertexai=True)` | `langchain-google-vertexai` `ChatVertexAI` is superseded — use the genai path. |
| Grounding | Vertex AI Search datastore attached as `Retrieval` tool → read `groundingMetadata.grounding_score` (0–1) for confidence | Structured `grounding_supports` gives per-chunk citations. |
| Confidence metric | `0.7 * grounding_score*100 + 0.3 * self_rated` (self-rated from structured output); discard if < threshold → escalate | Hybrid mitigates hallucination. |
| RAG ingestion | Vertex AI RAG Corpus API (`rag.corpora.create` + `rag.files.import_files` from GCS) | Managed embeddings — no manual vector index ops. |
| Orchestrator | **LangGraph 1.x `StateGraph`** (not `create_agent`) — 7-node deterministic topology | Deterministic branches fit StateGraph exactly. |
| LangGraph state | `TypedDict` internal (cheap checkpoints) + Pydantic at I/O boundaries | Standard 2025 pattern. |
| Per-ticket memory | `langgraph-checkpoint-firestore` `FirestoreSaver` | Per-ticket resume / HITL resume. |
| Cross-ticket clustering | Firestore-led recent-tickets ledger + `gemini-embedding-001` cosine sim | Hybrid → real Firebase, no extra Postgres. |
| Orchestration runtime | Python **FastAPI** on **Cloud Run** (locally runnable too) | `lru_cache` compiled graph; async nodeset. |
| Frontend | React + Vite + Tailwind, Firebase JS SDK v12 modular, `onSnapshot` realtime | Standard SPA. |
| Auth | Firebase Auth (email/password for agents) + custom claims `{role:"agent"}` gate escalation queue | |
| Hosting | Firebase Hosting, `public: dist` | `firebase deploy --only hosting`. |
| DB | Firestore collections per PRD §6.3: `tickets`, `kb_articles`, `incident_clusters`, `feedback` | Admin SDK writes bypass rules; IAM is the only gate. |
| Triggers | (1) Node 2nd-gen `onDocumentCreated("tickets/{id}")` → POST `/tickets` on orchestrator. (2) HTTP `/resolve` for KB self-update from dashboard. (3) Feedback 2nd-gen trigger adjusts thresholds. | Python 2nd-gen Firestore triggers in preview → use Node for ingestion trigger; Python for KB-update/feedback HTTP. |
| Embeddings | `gemini-embedding-001` (768-dim) for cross-ticket similarity + KB chunks | Current gen; `text-embedding-gecko` is legacy. |
| Region | `global` for Gemini 3.x. Firestore in a region adjacent to Cloud Run. | Preview models can 404 on regional endpoints. |

---

## 2. Core Agent Loop — LangGraph Topology

```
START → intake → retrieve → generate → dedup → route
                                              ├─ cluster_size≥3 → incident ─→ route2
                                              ├─ confidence≥thr → auto_resolve → END
                                              └─ else            → escalate    → END

(separate run, triggered by dashboard "/resolve")
human_resolved → kb_update → END
```

### Nodes — responsibility and I/O

| Node | Responsibility | Reads from state | Writes to state |
|---|---|---|---|
| `intake` | Normalize ticket, fetch prior ticket if re-submission, set initial status `"new"` | inbound ticket | `status`, `embedding` (cached) |
| `retrieve` | Query Vertex AI Search KB datastore, top-k chunks | `text` | `retrieved_chunks[]` |
| `generate` | Gemini grounded answer + confidence via Retrieval tool; structured output: `{answer, confidence, cited_chunk_ids, signals}` | `text`, embedded retrievals | `answer`, `confidence`, `cited_chunks[]` |
| `dedup` | Cross-channel: embed current, query Firestore ledger of last 20 min tickets, cosine sim ≥ 0.85 → same `cluster_id` | `text`, `embedding` | `cluster_id`, `cluster_size` |
| `incident` | if `cluster_size ≥ 3`: retrieve from changelog datastore, Gemini cross-ref → suspected root cause + confidence | `text`, `cluster_size` | `suspected_root_cause`, `root_cause_confidence`, `status="incident_flagged"` |
| `auto_resolve` | write `tickets/{id}` with `status="auto_resolved"`, `confidence`, `matched_kb_ids`; emit a `feedback` slot | `answer`, `confidence` | Firestore write |
| `escalate` | Build context bundle `{query, retrieved_chunks, partial_reasoning, cluster_id?}`, generate draft reply, write `tickets/{id}` `status="escalated"`, push to human queue | `text`, `retrieved_chunks`, `answer` | Firestore writes |

**Routing function** `route_after_answer(state)` (pure, sync — no LLM):
```python
if state["cluster_size"] >= INCIDENT_THRESHOLD:    return "incident"
if state["confidence"]    >= CONFIDENCE_THRESHOLD: return "auto_resolve"
return "escalate"
```

### State schema (`SupportTicketState` TypedDict — internal)

```python
class SupportTicketState(TypedDict):
    ticket_id: str
    channel: Literal["chat","email","slack","portal"]
    user_id: str
    text: str
    timestamp: datetime
    embedding: list[float] | None

    retrieved_chunks: Annotated[list[dict], extend_chunks]   # reducer = append
    answer: str
    confidence: float                       # 0..1
    cited_chunks: list[str]

    cluster_id: str | None
    cluster_size: int

    suspected_root_cause: str | None
    root_cause_confidence: float | None

    status: Literal[
        "new","retrieved","answered","clustered",
        "incident_flagged","auto_resolved","escalated","human_resolved"
    ]
    drafted_reply: str | None
    human_context_bundle: dict | None
    kb_article_id: str | None
```

### Pydantic I/O boundary models

```python
class TicketIn(BaseModel):  # inbound HTTP body
    ticket_id: str
    channel: Literal["chat","email","slack","portal"]
    user_id: str
    text: str
    timestamp: datetime | None = None    # default to server now()

class AnswerWithConfidence(BaseModel):   # structured output for generate node
    answer: str
    confidence: float = Field(ge=0.0, le=1.0)
    cited_chunks: list[str] = Field(default_factory=list)
```

---

## 3. Repository Layout

```
GrandFinale/
├─ README.md
├─ ARCHITECTURE.md                      ← this plan doc
├─ .env.example
├─ firebase.json
├─ firestore.rules
├─ firestore.indexes.json
├─ apps/dashboard/                      React + Vite + Tailwind SPA
│  ├─ src/{main.jsx, App.jsx, firebase.js,
│  │      auth/{AuthContext.jsx, ProtectedRoute.jsx, Login.jsx},
│  │      hooks/{useTickets.js, useIncidents.js, useKB.js, useFeedback.js, useAccuracyTrend.js},
│  │      components/{TicketTable.jsx, IncidentCard.jsx, KBCard.jsx,
│  │                  EscalationQueue.jsx, StatsBar.jsx, AccuracySpark.jsx, ChannelFeeds.jsx},
│  │      pages/{Dashboard.jsx, Escalation.jsx, Login.jsx}}
│  ├─ index.html, vite.config.js, tailwind.config.js, postcss.config.js, package.json
├─ orchestrator/                        Python FastAPI + LangGraph ★ core agent loop
│  ├─ main.py
│  ├─ graph/
│  │  ├─ state.py
│  │  ├─ builder.py
│  │  ├─ persistence.py
│  │  └─ nodes/{intake.py, retrieve.py, generate.py, dedup.py,
│  │            incident.py, auto_resolve.py, escalate.py, kb_update.py}
│  ├─ services/{gemini.py, rag.py, firestore.py, embeddings.py, kb_update.py}
│  ├─ config.py                         thresholds, ids, env utils
│  ├─ prompts/{answer.txt, confidence.txt, summary.txt, rootcause.txt, draft.txt}
│  ├─ requirements.txt
│  ├─ pyproject.toml
│  └─ Dockerfile
├─ functions/
│  ├─ ingestion/{index.js, package.json}    Node 2nd-gen onDocumentCreated → POST /tickets
│  └─ feedback/{index.js, package.json}     Node 2nd-gen onDocumentCreated("feedback") → threshold
├─ data/
│  ├─ kb_seed/        20-30 starter KB markdown articles
│  └─ changelog_seed/ mock recent deploy notes
└─ scripts/
   ├─ create_datastores.py
   ├─ seed_kb.py
   └─ simulate_traffic.py
```

---

## 4. Firestore Data Model (verbatim from PRD §6.3)

**`tickets`**
```jsonc
{ id, channel, user_id, text, timestamp,
  status: "auto_resolved" | "escalated" | "pending" | "incident_flagged",
  confidence_score, matched_kb_ids[], cluster_id (nullable),
  answer, drafted_reply, human_context_bundle (nullable), embedding }
```

**`kb_articles`** `{ id, title, body, tags[], source_ticket_id, created_at, embedding_ref }`

**`incident_clusters`**
```jsonc
{ id, ticket_ids[], first_seen, ticket_count,
  status: "active" | "resolved", summary,
  suspected_root_cause (nullable), root_cause_confidence }
```

**`feedback`** `{ id, ticket_id, feedback: "up" | "down", confidence_at_time, matched_kb_ids[], timestamp }`

**Indexes (firestore.indexes.json)**
- `tickets`: cluster_id ASC + createdAt DESC; status ASC + createdAt DESC; channel ASC
- `incident_clusters`: status ASC + first_seen DESC
- `feedback`: ticket_id ASC; confidence_at_time ASC

---

## 5. Build Phases & Demo-Critical Path Order

| # | Phase | Outcome | Loc |
|---|---|---|---|
| 1 | Monorepo skeleton + plan doc + env | folders, README/ARCH, .env.example, firebase.json shell | root |
| 2 | Orchestrator core: state + graph builder + stub nodes | LangGraph runs end-to-end with mock responses | orchestrator/ |
| 3 | Gemini + grounding service | real `google-genai` calls + confidence from `grounding_score` | services/gemini.py |
| 4 | RAG retriever for `retrieve` + `incident` | Vertex AI Search via `langchain-google-community` `VertexAISearchRetriever` | services/rag.py |
| 5 | Firestore persistence + checkpointer + ticket ledger | real Firestore writes, async | services/firestore.py, graph/persistence.py |
| 6 | Dedup + incident nodes wired to ledger | real clustering + root-cause prompt | nodes/dedup.py, nodes/incident.py |
| 7 | Escalate node + draft reply | context bundle + canned response gen | nodes/escalate.py, prompts/draft.txt |
| 8 | KB self-update service | `/resolve` endpoint summarization → KB article → re-index | services/kb_update.py, nodes/kb_update.py |
| 9 | Cloud Functions (ingestion, feedback) | triggers wired to orchestrator | functions/ |
| 10 | React dashboard scaffold + Firebase init + realtime hooks | live tickets/incidents/KB/escalation/stats | apps/dashboard/ |
| 11 | Simulated channels UI | chat/email/Slack mock submit forms | apps/dashboard/src/components/ChannelFeeds.jsx |
| 12 | Seed data + simulate_traffic script | 20-30 KB articles, changelog, demo driver | data/, scripts/ |
| 13 | Firebase Hosting + Cloud Run deploy + E2E smoke | demo-ready | — |

---

## 6. Confidence & Self-Tuning Strategy

- Default `CONFIDENCE_THRESHOLD = 0.70`.
- Default `INCIDENT_THRESHOLD = 3 tickets / 20 min`.
- Default `DEDUP_SIM_THRESHOLD = 0.85` cosine.
- Feedback processor (see §9)Leodrunning avg of downvote rate per (kb_id × confidence_band) buckets → adjusts the threshold upward for under performing KBs and flags them in the dashboard "KB for review" list.
- `DashboardStat.accuracy_trend` document updated with rolling (correct/(correct+wrong)).

---

## 7. Source references (research artifacts)

- LangGraph 1.2.x StateGraph + checkpointer docs: <https://langchain-ai.github.io/langgraph/>
- `google-genai` SDK + `client.aio` async: <https://google.dev/>
- Vertex AI Search Retrieval tool + `groundingMetadata`: <https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview>
- Vertex AI RAG Corpus API: <https://cloud.google.com/vertex-ai/generative-ai/docs/rag/rag-overview>
- `langchain-google-genai` `ChatGoogleGenerativeAI(vertexai=True)`: <https://python.langchain.com/docs/integrations/chat/google_generative_ai/>
- `langchain-google-community` `VertexAISearchRetriever`: <https://python.langchain.com/docs/integrations/retrievers/google_vertex_ai_search/>
- `langgraph-checkpoint-firestore`: <https://pypi.org/project/langgraph-checkpoint-firestore/>
- Firebase JS SDK v12 modular `onSnapshot`: <https://firebase.google.com/docs/firestore/query-data/listen>
- Firebase Admin Python async Firestore: <https://firebase.google.com/docs/reference/admin/python/firebase_admin.firestore>
- Cloud Functions 2nd-gen Firestore triggers: <https://firebase.google.com/docs/functions/firestore>
- Cloud Run stateless deploy + FastAPI + LangGraph: <https://langchain-ai.github.io/langgraph/deployment/>

---

## 8. Open risks / things to verify before demo

1. **`gemini-3.1-pro-preview` exact ID + endpoint** — verify in your GCP project's Model Garden. Default to `gemini-2.5-pro` if absent.
2. **Python 2nd-gen Firestore triggers in preview** — using Node for ingestion trigger is the safe path.
3. **Vertex AI RAG Corpus API GA status** — if not GA in your project, fall back to a managed Vertex AI Search datastore with direct document upload API.
4. **Cloud Run cold-start cost** of graph compile — use Startup CPU Boost + `--min-instances=1`.
5. **Quota** — set TPM cap to safe value below your per-project quota to avoid mid-demo 429s.
6. **Firestore embedding array storage** — keep `embedding` field namespaced (e.g. `embedding` top-level float-array ≤ 768 dims; Firestore max doc 1MB).
