# Product Requirements Document (PRD): ResolveIQ

**Project Name:** ResolveIQ (Enterprise AI Customer Support Automation)  
**Target:** Google Cloud AI Hackathon (Problem Statement #5)  
**Version:** 1.0  
**Status:** Production-Ready  

---

## 1. Executive Summary
ResolveIQ is an autonomous, multi-channel AI customer support ecosystem designed for mid-size B2B SaaS companies. By leveraging the Google Cloud AI stack—specifically Gemini, Gemma, and LangGraph—ResolveIQ creates a "closed-loop" system. It doesn't just answer queries; it proactively detects engineering incidents, performs root-cause analysis, and learns from human agent interventions to update its Knowledge Base in real-time.

## 2. Problem Statement
Mid-size B2B SaaS companies typically manage ~800 tickets per week. Approximately 40% of these are repetitive, costing support teams ~20 hours/week in manual labor. Furthermore, there is a significant lag in correlating support ticket spikes (e.g., "504 errors") with engineering deployments, leading to delayed incident response and customer frustration.

## 3. Goals & Objectives
*   **Instant Resolution:** Reduce First Response Time (FRT) from 12 minutes to 0 seconds for routine queries.
*   **High Automation:** Achieve a 40%+ auto-resolution rate without human intervention.
*   **Proactive Detection:** Identify software outages and their root causes within 3 seconds of a ticket spike.
*   **Continuous Improvement:** Implement a zero-delay self-learning loop where human resolutions are instantly vectorized into the Knowledge Base.

## 4. Target Users / Stakeholders
*   **Support Agents:** Benefit from AI-drafted responses and reduced repetitive workloads.
*   **Support Operations Managers:** Use the dashboard for incident monitoring and analytics.
*   **Engineering Teams:** Receive rapid alerts on breaking changes correlated to support volume.
*   **End Customers:** Receive immediate, accurate resolutions across Slack, Email, and Live Chat.

## 5. Functional Requirements

### 5.1. Multi-Channel Intake & Sentiment Analysis
*   **Requirement:** Ingest queries from Slack, Email (SendGrid), and WebSockets (Live Chat).
*   **Sentiment Engine:** Use **Gemma 2b-it** (Open Weights) to classify ticket sentiment (Frustrated, Urgent, Neutral, Positive) to prioritize the orchestration queue.

### 5.2. Semantic Deduplication & Caching
*   **Requirement:** Before full RAG processing, route queries to **Google AI Studio (Gemini 1.5 Flash)** to check against a recent ticket ledger.
*   **Logic:** If a semantic match is found, retrieve the cached answer and assign a 100% confidence score, bypassing redundant generation.

### 5.3. Grounded RAG Auto-Resolution
*   **Requirement:** Use **Vertex AI Search** to retrieve context from the Knowledge Base.
*   **Generation:** Use **Gemini 1.5 Pro** to generate answers with strict grounding.
*   **Threshold:** If the confidence score is $\ge$ 70%, auto-resolve the ticket and cite sources. If < 70%, escalate to a human agent with a drafted reply.

### 5.4. Automated Incident Detection & Root-Cause Analysis (RCA)
*   **Requirement:** Monitor ticket clusters. If $\ge$ 3 tickets report similar errors within 20 minutes, trigger an incident workflow.
*   **Correlation:** Query the **Changelog Service** (Google Cloud Logging/GitHub) and use Gemini to cross-reference symptoms with recent code releases.
*   **Alerting:** Display an Active Incident Banner on the Support Dashboard.

### 5.5. Agent-to-Agent (A2A) Workflow
*   **Requirement:** The Primary Orchestrator must dynamically invoke a **Data Analyst Agent**.
*   **Task:** The Data Analyst Agent queries **BigQuery** to generate impact reports (e.g., "How many Enterprise users are affected by this 504 error?") during an active incident.

### 5.6. Self-Learning Closed Loop
*   **Requirement:** When a human agent resolves an escalated ticket, the system must summarize the interaction and create a new `self-learned` KB article.
*   **Vectorization:** Instantly vectorize the new article into Vertex AI Search.

### 5.7. MCP Extensibility
*   **Requirement:** Implement a **FastMCP Server** to expose Knowledge Base and incident data to external AI clients (e.g., Claude Desktop).

---

## 6. Non-Functional Requirements
*   **Performance:** Incident detection and RCA must complete within 3 seconds of the threshold being met.
*   **Scalability:** System must handle spikes of up to 10x normal ticket volume using Google Cloud Run and Pub/Sub.
*   **Reliability:** Use a deterministic 7-node LangGraph StateGraph to prevent infinite LLM loops.
*   **Observability:** All agent transitions and LLM calls must be logged for auditability.

---

## 7. System Architecture Overview
The system is divided into six logical layers:
1.  **Client Layer:** Customer channels (Slack, Email, Chat) and the Support Dashboard.
2.  **Gateway Layer:** FastAPI handling normalization and authentication.
3.  **Agent Core (LangGraph):** The ResolveIQ Orchestrator, Data Analyst Agent, and Gemma Sentiment Service.
4.  **AI Services:** Gemini 1.5 Pro/Flash and Vertex AI Search.
5.  **Data Layer:** Firestore (Real-time state), BigQuery (Analytics), and Pub/Sub (Events).
6.  **External Integrations:** Changelog Service and MCP Server.

---

## 8. Tech Stack
*   **AI Models:** Gemini 1.5 Pro, Gemini 1.5 Flash, Gemma 2b-it.
*   **Orchestration:** LangGraph, Antigravity AI Framework.
*   **Backend:** Python, FastAPI, FastMCP.
*   **Frontend:** React, Vite, Tailwind CSS, Firebase SDK.
*   **Google Cloud Services:** Vertex AI, Vertex AI Search, Firestore, BigQuery, Pub/Sub, Cloud Run, Cloud Logging.
*   **Integrations:** Slack API, SendGrid, GitHub API.

---

## 9. Data Requirements

### 9.1. Firestore Collections
*   **`tickets`**: `id`, `status`, `confidence_score`, `cluster_id`, `embedding`, `sentiment`.
*   **`kb_articles`**: `id`, `title`, `body`, `tags`, `source_ticket_id` (for self-learned articles).
*   **`incident_clusters`**: `id`, `ticket_ids`, `suspected_root_cause`, `status`.

### 9.2. BigQuery Schema
*   **`resolved_tickets_archive`**: Long-term storage for trend analysis.
*   **`incident_impact_logs`**: Historical data for the Data Analyst Agent.

---

## 10. API Specifications
*   **POST `/v1/intake`**: Receives raw ticket data from channels.
*   **GET `/v1/dashboard/incidents`**: Streams active incident clusters to the React frontend.
*   **MCP Endpoints**: `list_resources`, `read_resource` (exposing KB and Incident logs).

---

## 11. Security Requirements
*   **Authentication:** API Gateway secured via Bearer tokens; Dashboard secured via Firebase Auth.
*   **Authorization:** Role-based access control (RBAC) for human agents vs. admins.
*   **Data Privacy:** PII masking in ticket text before processing by LLMs (where applicable).

---

## 12. Deployment & Infrastructure
*   **Containerization:** All services deployed as Docker containers.
*   **Orchestration:** Google Cloud Run for serverless scaling.
*   **CI/CD:** GitHub Actions for automated testing and deployment to GCP.

---

## 13. Success Metrics (KPIs)
*   **Auto-Resolution Rate:** Target > 40%.
*   **Mean Time to Detect (MTTD):** Target < 3 seconds for clustered incidents.
*   **Knowledge Base Growth:** Number of `self-learned` articles generated per week.
*   **Sentiment Shift:** Improvement in customer sentiment scores over time.

---

## 14. Timeline & Milestones
*   **Milestone 1:** Core RAG pipeline with Gemini 1.5 Pro and Vertex AI Search.
*   **Milestone 2:** Gemma sentiment analysis and Google AI Studio deduplication routing.
*   **Milestone 3:** Incident detection logic and Changelog correlation.
*   **Milestone 4:** A2A workflow (Data Analyst Agent) and BigQuery streaming.
*   **Milestone 5:** MCP Server implementation and Dashboard finalization.

---

## 15. Open Questions & Risks
*   **Risk:** Accuracy of the 70% confidence threshold; requires calibration during the hackathon.
*   **Question:** Will the Changelog Service require OAuth or personal access tokens for GitHub integration?
*   **Risk:** Latency introduced by multi-agent (A2A) hops.