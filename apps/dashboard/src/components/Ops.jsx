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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 text-slate-600 text-sm flex items-center gap-3 shadow-sm">
        <span className="text-xl">🎉</span>
        <span className="font-medium">No active incidents · All services operational</span>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((ic) => (
        <div
          key={ic.id}
          className="bg-rose-50/80 border border-rose-200 rounded-2xl p-5 shadow-sm animate-pulse-glow animate-fade-in"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-700 font-bold">
                <span className="text-base">🚨</span>
                Active Incident · {ic.ticket_count || 0} tickets correlated
              </div>
              <div className="mt-1.5 text-slate-800 font-medium">{ic.summary || "Cluster detected"}</div>
              <div className="mt-2 text-xs text-slate-500">
                First detected: {timeOf(ic.first_seen)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-slate-500 font-medium">Suspected Root Cause</div>
              <div className="text-sm text-rose-700 font-bold mt-0.5">
                {ic.suspected_root_cause || "Investigating…"}
              </div>
              <div className="text-xs mt-1.5 font-medium">
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
  const label = v >= 0.7 ? "High" : v >= 0.4 ? "Medium" : "Low";
  const badgeClass = v >= 0.7 
    ? "bg-emerald-100 text-emerald-700 border-emerald-200" 
    : v >= 0.4 
    ? "bg-amber-100 text-amber-700 border-amber-200" 
    : "bg-rose-100 text-rose-700 border-rose-200";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${badgeClass}`}>
      {label} confidence ({Math.round(v * 100)}%)
    </span>
  );
}

export function KBList() {
  const { items } = useKBArticles();
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <span className="text-sm">📚</span>
          Knowledge Base · {items.length} Articles
        </div>
        {items.length > 0 && (
          <div className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fade-in">
            +{items.filter((a) => a.source_ticket_id).length} Self-learned
          </div>
        )}
      </div>
      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="text-slate-400 text-sm">No KB articles indexed yet.</div>
        )}
        {items.map((a) => (
          <div key={a.id} className="border border-slate-200/60 bg-slate-50/50 rounded-xl p-3.5 text-sm hover:border-slate-300 transition-colors animate-fade-in">
            <div className="font-semibold text-slate-800 truncate">{a.title}</div>
            <div className="text-xs text-slate-500 line-clamp-2 mt-1">{a.summary || a.body}</div>
            <div className="mt-2.5 flex gap-1.5 flex-wrap">
              {(a.tags || []).map((t) => (
                <span key={t} className="text-[10px] font-medium px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md">
                  {t}
                </span>
              ))}
              {a.source_ticket_id && (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
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
      setSuccess(`Resolved! New KB article generated: ${data.kb_article_id || "indexed"}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
        <span className="text-sm">⬆️</span>
        Escalation Queue · {items.length} Pending Human Review
      </div>

      {success && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-medium animate-fade-in">
          ✓ {success}
        </div>
      )}

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="text-slate-400 text-sm flex items-center gap-2 py-4 justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <span>🤖</span> No escalated tickets. AI Agent is handling all traffic!
          </div>
        )}
        {items.map((t) => (
          <div key={t.id} className="border border-slate-200/80 bg-slate-50/40 rounded-xl p-4 hover:border-slate-300 transition-colors animate-slide-in-right">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-400 font-medium">#{t.id}</div>
                <div className="text-sm font-semibold text-slate-800 mt-1">{t.text}</div>
              </div>
              <div className="text-right text-xs shrink-0">
                <div className="text-slate-400 font-medium">Confidence</div>
                <div className="font-mono text-amber-600 font-bold">
                  {t.confidence_score !== null && t.confidence_score !== undefined
                    ? `${Math.round((t.confidence_score || 0) * 100)}%`
                    : "—"}
                </div>
              </div>
            </div>

            {t.drafted_reply && (
              <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3.5 text-xs shadow-2xs">
                <div className="text-[10px] uppercase tracking-wider text-blue-600 font-bold mb-1 flex items-center gap-1.5">
                  <span>🤖</span> AI Drafted Reply (editable before send)
                </div>
                <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                  {t.drafted_reply}
                </pre>
              </div>
            )}

            {t.human_context_bundle && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 transition-colors font-medium">
                  📎 Context bundle ({t.human_context_bundle?.retrieved_chunks?.length || 0} KB chunks)
                </summary>
                <pre className="mt-2 bg-slate-100 p-3 rounded-lg overflow-x-auto text-slate-600 border border-slate-200 font-mono text-[11px]">
                  {JSON.stringify(t.human_context_bundle, null, 2)}
                </pre>
              </details>
            )}

            {resolving === t.id ? (
              <div className="mt-3 space-y-2.5">
                <textarea
                  rows={3}
                  placeholder="Type resolution here… (will be automatically summarized into a self-learned KB article)"
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all shadow-2xs"
                />
                {error && <div className="text-xs text-rose-600 font-medium">✗ {error}</div>}
                <div className="flex gap-2">
                  <button
                    disabled={submitting || !resolutionText.trim()}
                    onClick={() => submit(t.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Summarizing & Resolving…
                      </>
                    ) : "✓ Resolve & learn"}
                  </button>
                  <button
                    onClick={() => { setResolving(null); setResolutionText(""); setError(null); }}
                    className="text-slate-500 hover:text-slate-800 font-medium text-xs px-3 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setResolving(t.id); setResolutionText(""); }}
                className="mt-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-xs hover:scale-[1.01]"
              >
                🧠 Resolve + Add to KB
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
