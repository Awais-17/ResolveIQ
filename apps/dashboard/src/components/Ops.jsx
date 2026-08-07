import { useIncidents, useKBArticles, useEscalations } from "../hooks/useRealtime";
import { ORCHESTRATOR_URL } from "../firebase";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

function timeOf(ts) {
  if (!ts) return "—";
  if (typeof ts.toDate === "function") return ts.toDate().toLocaleTimeString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleTimeString();
  return "—";
}

export function IncidentCard() {
  const { items } = useIncidents();
  if (items.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-slate-500 text-sm flex items-center gap-2">
        <span className="text-lg">🎉</span> No active incidents
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((ic) => (
        <div
          key={ic.id}
          className="bg-crit-500/10 border border-crit-500/30 rounded-xl p-4 animate-pulse-glow animate-fade-in"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-crit-500 font-semibold">
                <span className="text-base">🚨</span>
                Active Incident · {ic.ticket_count || 0} tickets
              </div>
              <div className="mt-1 text-slate-200">{ic.summary || "Cluster detected"}</div>
              <div className="mt-2 text-xs text-slate-400">
                First seen: {timeOf(ic.first_seen)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-400">Root cause</div>
              <div className="text-sm text-crit-500 font-medium mt-0.5">
                {ic.suspected_root_cause || "Investigating…"}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                <ConfidenceBadge value={ic.root_cause_confidence} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfidenceBadge({ value }) {
  const v = value || 0;
  const label = v >= 0.7 ? "high" : v >= 0.4 ? "medium" : "low";
  const color = v >= 0.7 ? "text-ok-500" : v >= 0.4 ? "text-warn-500" : "text-slate-400";
  return (
    <span className={color}>
      {label} confidence ({Math.round(v * 100)}%)
    </span>
  );
}

export function KBList() {
  const { items } = useKBArticles();
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
          <span className="text-sm">📚</span>
          Knowledge Base · {items.length} articles
        </div>
        {items.length > 0 && (
          <div className="text-[10px] px-2 py-0.5 rounded-full bg-ok-700/20 text-emerald-300 animate-fade-in">
            +{items.filter((a) => a.source_ticket_id).length} self-learned
          </div>
        )}
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="text-slate-500 text-sm">No KB articles yet.</div>
        )}
        {items.map((a) => (
          <div key={a.id} className="border border-slate-800 rounded-lg p-3 text-sm hover:border-slate-700 transition-colors animate-fade-in">
            <div className="font-medium text-slate-100 truncate">{a.title}</div>
            <div className="text-xs text-slate-400 line-clamp-2 mt-1">{a.summary || a.body}</div>
            <div className="mt-2 flex gap-1 flex-wrap">
              {(a.tags || []).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                  {t}
                </span>
              ))}
              {a.source_ticket_id && (
                <span className="text-[10px] px-1.5 py-0.5 bg-brand-700/20 text-brand-500 rounded">
                  🧠 self-learned
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EscalationQueue({ onResolve }) {
  const { items } = useEscalations();
  const { user } = useAuth();
  const [resolving, setResolving] = useState(null);
  const [resolutionText, setResolutionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const submit = async (ticketId) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const resp = await fetch(`${ORCHESTRATOR_URL}/tickets/${ticketId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resolution_text: resolutionText,
          agent_id: user?.uid || "unknown",
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      onResolve?.(ticketId, data);
      setResolving(null);
      setResolutionText("");
      setSuccess(`Resolved! New KB article: ${data.kb_article_id || "generated"}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400 mb-3">
        <span className="text-sm">⬆️</span>
        Escalation Queue · {items.length} pending human review
      </div>

      {success && (
        <div className="mb-3 bg-ok-500/10 border border-ok-500/30 rounded-lg p-3 text-xs text-ok-400 animate-fade-in">
          ✓ {success}
        </div>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="text-slate-500 text-sm flex items-center gap-2">
            <span>🤖</span> No escalated tickets. Agent is handling everything.
          </div>
        )}
        {items.map((t) => (
          <div key={t.id} className="border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors animate-slide-in-right">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-500">#{t.id}</div>
                <div className="text-sm text-slate-100 mt-1">{t.text}</div>
              </div>
              <div className="text-right text-xs shrink-0">
                <div className="text-slate-400">Confidence</div>
                <div className="font-mono text-warn-500">
                  {t.confidence_score !== null && t.confidence_score !== undefined
                    ? `${Math.round((t.confidence_score || 0) * 100)}%`
                    : "—"}
                </div>
              </div>
            </div>

            {t.drafted_reply && (
              <div className="mt-3 bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  <span>🤖</span> AI Draft reply (editable before send)
                </div>
                <pre className="whitespace-pre-wrap font-sans text-slate-300">
                  {t.drafted_reply}
                </pre>
              </div>
            )}

            {t.human_context_bundle && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-400 hover:text-slate-200 transition-colors">
                  📎 Context bundle ({t.human_context_bundle?.retrieved_chunks?.length || 0} KB chunks)
                </summary>
                <pre className="mt-2 bg-slate-950/60 p-2 rounded overflow-x-auto text-slate-400">
                  {JSON.stringify(t.human_context_bundle, null, 2)}
                </pre>
              </details>
            )}

            {resolving === t.id ? (
              <div className="mt-3 space-y-2">
                <textarea
                  rows={3}
                  placeholder="How did you resolve this? (will be summarized into a KB article)"
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:border-brand-500 focus:outline-none transition-colors"
                />
                {error && <div className="text-xs text-crit-500">✗ {error}</div>}
                <div className="flex gap-2">
                  <button
                    disabled={submitting || !resolutionText.trim()}
                    onClick={() => submit(t.id)}
                    className="bg-ok-700 hover:bg-ok-600 disabled:opacity-50 text-white text-xs px-4 py-2 rounded-lg transition-all flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Resolving…
                      </>
                    ) : "✓ Resolve & learn"}
                  </button>
                  <button
                    onClick={() => { setResolving(null); setResolutionText(""); setError(null); }}
                    className="text-slate-400 hover:text-slate-200 text-xs px-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setResolving(t.id); setResolutionText(""); }}
                className="mt-3 text-xs bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg transition-all hover:scale-[1.02]"
              >
                🧠 Resolve + add to KB
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
