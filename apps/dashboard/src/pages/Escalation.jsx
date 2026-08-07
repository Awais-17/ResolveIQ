import { EscalationQueue } from "../components/Ops";

export default function Escalation() {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400">
          Resolving a ticket here triggers the self-updating KB loop (PRD §5.6):
        </div>
        <ol className="mt-2 text-sm text-slate-300 space-y-1 list-decimal list-inside">
          <li>Agent types the resolution.</li>
          <li>Orchestrator summarizes the Q&A into a new KB article (Gemini).</li>
          <li>Article is written to Firestore + Vertex AI Search index.</li>
          <li>Future identical questions are auto-resolved — dashboard KB counter ticks up.</li>
        </ol>
      </div>
      <EscalationQueue />
    </div>
  );
}
