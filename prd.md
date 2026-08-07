# Product Requirements Document (PRD)
**Project Name:** ResolveIQ (Enterprise AI Customer Support Automation)
**Target:** Google Cloud AI Hackathon (Problem Statement #5)

---

## 1. Product Overview & Vision
**ResolveIQ** is an autonomous, multi-channel AI customer support agent designed for mid-size B2B SaaS companies. Built on the Google Cloud and Gemini AI stack, it ingests customer queries across channels (Live Chat, Email, Slack) and aims to intelligently auto-resolve them. 

The ultimate vision is to create a "closed-loop" support ecosystem that not only answers questions instantly but proactively detects engineering incidents and learns from human agents to continuously improve its own Knowledge Base.

---

## 2. Problem Statement
Mid-size B2B SaaS companies handle approximately **800 tickets per week**, with up to **40% of these being repetitive queries**. Support teams lose significant time (~20 hours/week) manually answering these repeat questions and struggling to correlate sudden spikes in support tickets to specific engineering code releases or backend outages.

---

## 3. Goals & Success Metrics
- **First Response Time:** Reduce from the industry average of 12 minutes to 0 seconds (instant auto-resolution).
- **Auto-Resolution Rate:** Automatically handle and resolve 40%+ of incoming routine queries without human intervention.
- **Incident Detection:** Identify and flag software outage root causes within 3 seconds of a ticket spike.
- **Self-Learning Loop:** Achieve zero-delay Knowledge Base updates by instantly vectorizing human-provided resolutions.

---

## 4. Core Features & Capabilities

### 4.1 Grounded RAG Auto-Resolution
- Queries are semantically matched against a vectorized Knowledge Base.
- The Gemini Generative model evaluates the retrieved context and generates an answer with a strict confidence score (0.0 - 1.0) derived from grounding metrics.
- If the confidence score is >= 70%, the ticket is immediately auto-resolved and cited sources are attached.

### 4.2 Semantic Deduplication & Answer Caching
- An LLM-based semantic matching function evaluates incoming queries against recent tickets to determine if they share the exact same intent (e.g., "where is ketchup?" vs "I can't find my ketchup").
- If a match is confirmed, the system bypasses redundant generation, retrieves the cached answer from the identical cluster, and assigns a 100% confidence score.
- This ledger is maintained both in-memory and persistently in Firestore.

### 4.3 Automated Incident Detection & Root-Cause Analysis
- The system continuously monitors incoming volume. When >= 3 tickets report similar errors (e.g., "504 Upload Timeout") within a 20-minute window, they are clustered.
- The system automatically retrieves recent software deployment logs (Changelog) and cross-references them against the clustered symptoms using Gemini.
- The LLM identifies the breaking release and alerts the support operations dashboard with an Active Incident Banner.

### 4.4 Self-Learning Closed Loop
- Tickets that fall below the 70% confidence threshold are escalated to a human agent, complete with an AI-drafted response and context bundle.
- Once the human agent submits a resolution, ResolveIQ automatically summarizes the interaction into a new Knowledge Base article tagged as `self-learned`.
- The new article is vectorized instantly, ensuring future identical queries are auto-resolved.

---

## 5. Architecture & Tech Stack

### 5.1 Tech Stack & Hackathon Requirements
- **AI Model (Gemini):** Gemini 3.1 Pro Preview / Gemini 2.5 Flash via Vertex AI for primary orchestration and grounded generation.
- **Google AI Studio:** Explicit routing via `generativelanguage.googleapis.com` for the semantic deduplication engine.
- **Open Weights (Gemma):** Local/cloud Gemma integration for ticket sentiment analysis (Frustrated, Urgent, Neutral, Positive).
- **Frameworks:** LangGraph (Agent Orchestration), FastAPI (Backend).
- **Agent-to-Agent (A2A):** Primary Support Agent dynamically invokes a secondary Data Analyst Agent for incident impact reports.
- **Database:** Google Cloud Firestore (Async Python SDK for backend, React Web SDK v12 for live frontend syncing).
- **Analytics (BigQuery):** Asynchronous streaming of all resolved tickets to a BigQuery data warehouse.
- **Extensibility (MCP):** Model Context Protocol (FastMCP) server exposing the Knowledge Base and incident data to external LLMs.
- **AI Partner:** Co-architected and built with Antigravity AI.
- **Frontend:** React + Vite + Tailwind CSS.

### 5.2 LangGraph Agent Workflow
ResolveIQ operates on a deterministic 7-node LangGraph StateGraph to prevent infinite LLM loops:
1. **Intake:** Normalizes the ticket and fetches any prior state.
2. **Retrieve:** Queries Vertex AI Search KB datastore for top-k chunks.
3. **Generate:** Grounded generation via Gemini yielding an answer and confidence score.
4. **Dedup:** Semantic embedding and Gemini-based deduplication against a recent ticket ledger.
5. **Route:** Sync router assessing cluster size and confidence threshold.
6. **Incident (Conditional):** Triggered if cluster size >= 3. Performs root-cause analysis against changelogs.
7. **AutoResolve (7A):** Writes to Firestore with resolved status if confidence >= 70%.
8. **Escalate (7B):** Drafts human response and pushes to escalation queue if confidence < 70%.

---

## 6. Data Model (Firestore)

### 6.1 `tickets` Collection
Stores incoming and processed tickets.
- **Fields:** `id`, `channel`, `user_id`, `text`, `timestamp`, `status`, `confidence_score`, `matched_kb_ids`, `cluster_id`, `answer`, `drafted_reply`, `embedding`.

### 6.2 `kb_articles` Collection
Stores documentation and self-learned articles.
- **Fields:** `id`, `title`, `body`, `tags`, `source_ticket_id`, `created_at`, `embedding_ref`.

### 6.3 `incident_clusters` Collection
Tracks active outages and root cause analysis.
- **Fields:** `id`, `ticket_ids`, `first_seen`, `ticket_count`, `status`, `summary`, `suspected_root_cause`, `root_cause_confidence`.

### 6.4 `feedback` Collection
Tracks user satisfaction and adjusts confidence thresholds over time.
- **Fields:** `id`, `ticket_id`, `feedback`, `confidence_at_time`, `timestamp`.

---

## 7. Out of Scope / Future Considerations
- Automated rollback of bad deployments via webhook triggers (Phase 2).
- Native integration with external ticketing systems like Zendesk or Jira Service Desk.
- Multi-language support (relying on Gemini's native translation capabilities, but UI remains English).
