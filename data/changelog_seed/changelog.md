# Changelog Seed — ResolveIQ (mock CI/CD notes)

These are the simulated *recent deploys* the agent cross-references
when an incident cluster forms (PRD §5.8). The orchestrator queries
the **changelog** Vertex AI Search datastore on incident detection.

> Keep entries dated relative to the demo day so root-cause linking
> is plausible in real time.

---

## release-2026.08.05-r3   (shipped 2026-08-05 09:42 UTC)

- **uploads:** Switched cloud-storage multipart encoder to the new
  streaming `v2/multipart` implementation. Latency targets dropped
  ~22 % for files ≥ 50 MB.
- **known-risk:** Some legacy browsers may send truncated finalize
  chunks; mitigated by retry queue on the server.
- **observability:** Added span metrics for `uploads.finalize.duration`.

## release-2026.08.05-r2   (shipped 2026-08-05 07:15 UTC)

- **auth:** Tightened `/auth/token` IP rate-limit from 50 → 30 / 3 min
  to combat credential stuffing. Refresh-token flow unaffected.
- **rollback:** Can be rolled back without rebuilding SDKs.

## release-2026.08.04-r1   (shipped 2026-08-04 18:03 UTC)

- **dashboard:** Initial release of the live Ops dashboard.
- **functions:** Ingestion and feedback 2nd-gen Cloud Functions added.
- **rag:** KB corpus starter pack (30 articles) imported.

## release-2026.08.03-r4   (shipped 2026-08-03 22:11 UTC)

- **billing:** Improved VAT handling for EU customers (single rate, no
  longer regional splits).
- **known-issue:** Sidebar currency dropdown occasionally shows stale
  rate — fixed in next deploy.

## release-2026.08.02-r1   (shipped 2026-08-02 11:50 UTC)

- **exports:** New asynchronous audit-log exporter (BigQuery sink).
- **migration:** Existing sync exporters continue to work — deprecation
  notice emailed to customers.
