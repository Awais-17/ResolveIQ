/**
 * ResolveIQ ingestion — 2nd-gen Cloud Function.
 *
 * Fires on Firestore `onDocumentCreated("tickets/{ticketId}")` and POSTs the
 * normalized ticket to the orchestrator (Cloud Run or local FastAPI).
 *
 * Latency target: < 5 s end-to-end (PRD §8).
 * Reliability: the trigger will retry on failure but if the orchestrator is
 * unreachable, the ticket remains in `status=pending` on Firestore and the
 * dashboard will reflect that — no ticket is silently dropped.
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { defineString } from "firebase-functions/params";

const ORCHESTRATOR_URL = defineString("ORCHESTRATOR_URL", {
  default: "http://localhost:8080",
  description: "ResolveIQ orchestrator (Cloud Run URL in prod).",
});

export const onTicketCreated = onDocumentCreated(
  {
    document: "tickets/{ticketId}",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const id = event.params.ticketId;
    const ticket = event.data?.data();
    if (!ticket) {
      logger.warn("ingestion.skipped_empty", { id });
      return;
    }
    if (ticket.status && ticket.status !== "pending") {
      logger.info("ingestion.skip_already_processed", { id, status: ticket.status });
      return;
    }

    const payload = JSON.stringify({
      ticket_id: id,
      channel: ticket.channel,
      user_id: ticket.user_id,
      text: ticket.text,
      timestamp: ticket.timestamp,
    });

    try {
      const resp = await fetch(`${ORCHESTRATOR_URL.value()}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(50_000),
      });
      logger.info("ingestion.forwarded", {
        id,
        status: resp.status,
        orchestrator: ORCHESTRATOR_URL.value(),
      });
    } catch (err) {
      logger.error("ingestion.forward_failed", {
        id,
        error: String(err),
      });
      throw err; // retried by the platform
    }
  }
);
