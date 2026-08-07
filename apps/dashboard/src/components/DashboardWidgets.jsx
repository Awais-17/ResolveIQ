import { useTickets, useEscalations, useAccuracyTrend } from "../hooks/useRealtime";
import { useState } from "react";

const CHANNEL_META = {
  chat:  { chip: "bg-sky-500/20 text-sky-300",  label: "Chat"  },
  email: { chip: "bg-violet-500/20 text-violet-300", label: "Email" },
  slack: { chip: "bg-amber-500/20 text-amber-300",  label: "Slack" },
  portal:{ chip: "bg-emerald-500/20 text-emerald-300", label: "Portal" },
};

const STATUS_META = {
  auto_resolved:       { chip: "bg-ok-500/20 text-ok-500",   label: "Auto-resolved", icon: "✓" },
  escalated:           { chip: "bg-warn-500/20 text-warn-500", label: "Escalated", icon: "⬆" },
  incident_flagged:    { chip: "bg-crit-500/20 text-crit-500", label: "Incident", icon: "🚨" },
  pending:             { chip: "bg-slate-500/20 text-slate-300 animate-pulse-pending", label: "Pending", icon: "⏳" },
  human_resolved:      { chip: "bg-emerald-700/20 text-emerald-300", label: "Human-resolved", icon: "👤" },
};

const CHANNELS = ["chat", "email", "slack", "portal"];

function pct(value) {
  return `${Math.round((value || 0) * 100)}%`;
}

function timeAgo(epoch_ms) {
  if (!epoch_ms) return "—";
  const s = (Date.now() - epoch_ms) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function toEpoch(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return new Date(ts).getTime() || 0;
}

export function StatsBar() {
  const { items: tickets } = useTickets({ limit: 200 });
  const { items: escalations } = useEscalations();
  const { stat } = useAccuracyTrend();

  const autoResolved = tickets.filter((t) => t.status === "auto_resolved").length;
  const incidents = tickets.filter((t) => t.status === "incident_flagged");
  const incidentsActive = incidents.length;
  const resolveRate = tickets.length ? autoResolved / tickets.length : 0;
  const minutesSaved = autoResolved * 6;
  const hoursSaved = (minutesSaved / 60).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <StatCard label="Resolve rate"     value={pct(resolveRate)}  tone="ok"      icon="🎯" />
      <StatCard label="Auto resolved"    value={autoResolved}      tone="brand"   icon="🤖" />
      <StatCard label="Escalations"      value={escalations.length} tone="warn"   icon="⬆️" />
      <StatCard label="Active incidents" value={incidentsActive}   tone="crit"    icon="🚨" />
      <StatCard label="Agent-hours saved" value={hoursSaved}       tone="emerald" icon="⏱️" />
      <StatCard label="System accuracy"  value={pct(stat.accuracy)} tone={stat.accuracy >= 0.85 ? "ok" : "warn"} icon="📊" />
      <StatCard label="Feedback samples" value={stat.total || 0}   tone="slate"   icon="📝" />
    </div>
  );
}

function StatCard({ label, value, tone = "slate", icon }) {
  const tones = {
    ok:      "text-ok-500    border-ok-500/20    from-ok-500/5",
    warn:    "text-warn-500  border-warn-500/20  from-warn-500/5",
    crit:    "text-crit-500  border-crit-500/20  from-crit-500/5",
    brand:   "text-brand-500 border-brand-500/20 from-brand-500/5",
    emerald: "text-emerald-400 border-emerald-500/20 from-emerald-500/5",
    slate:   "text-slate-200 border-slate-700    from-slate-500/5",
  };
  const cls = tones[tone] || tones.slate;
  return (
    <div className={`bg-gradient-to-br ${cls} to-transparent border rounded-xl p-4 transition-all hover:scale-[1.02]`}>
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${cls.split(' ')[0]}`}>{value}</div>
    </div>
  );
}

export function ChannelBreakdown() {
  const { items: tickets } = useTickets({ limit: 500 });
  const counts = CHANNELS.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});
  tickets.forEach((t) => {
    if (counts[t.channel] !== undefined) counts[t.channel] += 1;
  });

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-3">
        Tickets by channel (last 500)
      </div>
      <div className="flex flex-wrap gap-2">
        {CHANNELS.map((c) => (
          <div key={c} className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${CHANNEL_META[c].chip}`}>
              {CHANNEL_META[c].label}
            </span>
            <span className="font-mono text-lg">{counts[c]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TicketTable() {
  const { items } = useTickets({ limit: 100 });
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-400">
          Live Ticket Stream (click any row to view AI answer)
        </span>
        <span className="text-xs text-slate-500 font-mono">{items.length} tickets</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-400 bg-slate-950/40">
            <tr>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Channel</th>
              <th className="text-left font-medium px-3 py-2">User</th>
              <th className="text-left font-medium px-3 py-2">Text</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-right font-medium px-3 py-2">Confidence</th>
              <th className="text-left font-medium px-3 py-2">Cluster</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Waiting for tickets…
                </td>
              </tr>
            )}
            {items.map((t, idx) => (
              <>
                <tr
                  key={t.id}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  className={`border-t border-slate-800/70 hover:bg-slate-800/40 cursor-pointer transition-colors ${idx === 0 ? "animate-fade-in" : ""}`}
                >
                  <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">
                    {timeAgo(toEpoch(t.createdAt))}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CHANNEL_META[t.channel]?.chip || "bg-slate-700 text-slate-300"}`}>
                      {CHANNEL_META[t.channel]?.label || t.channel}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">{t.user_id}</td>
                  <td className="px-3 py-2 max-w-md truncate font-medium text-slate-200" title={t.text}>{t.text}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${STATUS_META[t.status]?.chip || "bg-slate-700 text-slate-300"}`}>
                      <span>{STATUS_META[t.status]?.icon || ""}</span>
                      {STATUS_META[t.status]?.label || t.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {t.confidence_score !== undefined && t.confidence_score !== null ? (
                      <span className={t.confidence_score >= 0.7 ? "text-ok-500" : t.confidence_score >= 0.4 ? "text-warn-500" : "text-crit-500"}>
                        {pct(t.confidence_score)}
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">
                    {t.cluster_id || "—"}
                  </td>
                </tr>

                {/* Expanded Answer Row */}
                {expandedId === t.id && (
                  <tr key={`${t.id}-exp`} className="bg-slate-950/80 border-t border-slate-800/40">
                    <td colSpan={7} className="p-4">
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-brand-400 font-semibold uppercase tracking-wider">🤖 Gemini AI Generated Answer:</span>
                          {t.matched_kb_ids && t.matched_kb_ids.length > 0 && (
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                              Cited: {t.matched_kb_ids.join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-300 font-sans leading-relaxed whitespace-pre-wrap">
                          {t.answer || t.drafted_reply || "No answer generated yet."}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AccuracySpark() {
  const { samples = [] } = useAccuracyTrend().stat || {};
  if (samples.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
          Accuracy trend (rolling)
        </div>
        <div className="text-slate-500 text-sm h-24 flex items-center justify-center">
          Awaiting feedback…
        </div>
      </div>
    );
  }
  const w = 280;
  const h = 70;
  const n = samples.length;
  const running = [];
  let correct = 0;
  samples.forEach((s, i) => {
    if (s.value > 0) correct++;
    running.push(correct / (i + 1));
  });
  const pts = running.map((v, i) => `${(i / (n - 1)) * w},${h - v * h}`).join(" ");
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">
        Accuracy trend (rolling)
      </div>
      <svg width={w} height={h} className="block">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="2" />
        <line x1="0" y1={h - 0.7 * h} x2={w} y2={h - 0.7 * h} stroke="#475569" strokeDasharray="3 3" />
      </svg>
      <div className="text-xs text-slate-500 mt-1">last {n} samples — target ≥ 85%</div>
    </div>
  );
}
