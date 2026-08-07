/**
 * ResolveIQ feedback processor — 2nd-gen Cloud Function.
 *
 * Fires on `onDocumentCreated("feedback/{feedbackId}")` and maintains a
 * rolling per-KB-downvote ledger. When a KB article accumulates a
 * disproportionate share of downvotes it (a) nudges the confidence
 * threshold upward for similar future queries and (b) flags the article
 * in Firestore for human review — instead of continuing to trust it.
 *
 * This is Phase 5.10 of the PRD: the dashboard's accuracy trend line
 * reflects the system tuning itself over the demo session.
 *
 * We track per-KB counters in a `kb_health` collection:
 *   { total_feedback, upvotes, downvotes, downvote_rate, flagged_for_review }
 */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();

const FEEDBACK_THRESHOLD = 5;            // need at least N reviews before flagging
const DOWNVOTE_RATE_FLAG = 0.40;          // > 40% downvotes triggers a flag

export const onFeedbackCreated = onDocumentCreated(
  {
    document: "feedback/{feedbackId}",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (event) => {
    const feedback = event.data?.data();
    if (!feedback) return;

    const kbIds = Array.isArray(feedback.matched_kb_ids) ? feedback.matched_kb_ids : [];
    if (kbIds.length === 0) {
      logger.info("feedback.no_kb", { id: event.params.feedbackId });
      return;
    }

    const isUp = feedback.feedback === "up";
    const isDown = feedback.feedback === "down";

    for (const kbId of kbIds) {
      try {
        const ref = getFirestore().doc(`kb_health/${kbId}`);
        await getFirestore().runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const cur = snap.exists ? snap.data() : {
            total_feedback: 0,
            upvotes: 0,
            downvotes: 0,
            downvote_rate: 0,
            flagged_for_review: false,
            confidence_adjustment: 0,
          };
          const total = cur.total_feedback + 1;
          const upvotes = cur.upvotes + (isUp ? 1 : 0);
          const downvotes = cur.downvotes + (isDown ? 1 : 0);
          const rate = downvotes / total;
          const flagged = total >= FEEDBACK_THRESHOLD && rate >= DOWNVOTE_RATE_FLAG;
          const adjustment = flagged
            ? Math.min(0.10, cur.confidence_adjustment + 0.02)   // raise threshold for similar future queries by up to 0.10 max
            : 0;

          tx.set(ref, {
            kb_id: kbId,
            total_feedback: total,
            upvotes,
            downvotes,
            downvote_rate: rate,
            flagged_for_review: flagged,
            confidence_adjustment: adjustment,
            updatedAt: FieldValue.serverTimestamp(),
            last_feedback_id: event.params.feedbackId,
            last_feedback_value: feedback.feedback,
          }, { merge: true });
        });
      } catch (err) {
        logger.error("feedback.kb_health_failed", { kbId, error: String(err) });
      }
    }

    // Update the dashboard's rolling accuracy stat.
    try {
      const statRef = getFirestore().doc("stats/accuracy");
      await getFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(statRef);
        const cur = snap.exists ? snap.data() : { correct: 0, wrong: 0, samples: [] };
        const correct = cur.correct + (isUp ? 1 : 0);
        const wrong = cur.wrong + (isDown ? 1 : 0);
        const ts = new Date().toISOString();
        const samples = [...(cur.samples || []), { ts, value: isUp ? 1 : 0 }].slice(-100);
        tx.set(statRef, {
          correct,
          wrong,
          total: correct + wrong,
          accuracy: correct + wrong > 0 ? correct / (correct + wrong) : 0,
          samples,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    } catch (err) {
      logger.error("feedback.stat_failed", { error: String(err) });
    }
  }
);
