import { useTickets, useEscalations, useAccuracyTrend } from "../hooks/useRealtime";
import { useState } from "react";

const CHANNEL_META = {
  chat:   { chip: "bg-sky-50 text-sky-700 border border-sky-200/80 font-medium",    label: "Chat"   },
  email:  { chip: "bg-violet-50 text-violet-700 border border-violet-200/80 font-medium", label: "Email"  },
  slack:  { chip: "bg-amber-50 text-amber-700 border border-amber-200/80 font-medium",  label: "Slack"  },
  portal: { chip: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium", label: "Portal" },
};

const STATUS_META = {
  auto_resolved:    { chip: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-medium", label: "Auto-resolved", icon: "✓" },
  escalated:        { chip: "bg-amber-50 text-amber-700 border border-amber-200/80 font-medium",   label: "Escalated", icon: "⬆" },
  incident_flagged: { chip: "bg-rose-50 text-rose-700 border border-rose-200/80 font-medium",     label: "Incident", icon: "🚨" },
  pending:          { chip: "bg-slate-100 text-slate-600 border border-slate-200/80 font-medium animate-pulse-pending", label: "Pending", icon: "⏳" },
  human_resolved:   { chip: "bg-teal-50 text-teal-700 border border-teal-200/80 font-medium",       label: "Human-resolved", icon: "👤" },
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
      <StatCard label="Resolve rate"      value={pct(resolveRate)}   tone="emerald" icon="🎯" grade="A+" />
      <StatCard label="Auto resolved"     value={autoResolved}       tone="blue"    icon="🤖" grade="A" />
      <StatCard label="Escalations"       value={escalations.length} tone="amber"   icon="⬆️" grade="B" />
      <StatCard label="Active incidents"  value={incidentsActive}    tone="rose"    icon="🚨" grade={incidentsActive > 0 ? "F" : "A+"} />
      <StatCard label="Hours saved"       value={`${hoursSaved}h`}   tone="emerald" icon="⏱️" grade="A+" />
      <StatCard label="System accuracy"   value={pct(stat.accuracy)} tone={stat.accuracy >= 0.85 ? "emerald" : "amber"} icon="📊" grade={stat.accuracy >= 0.85 ? "A" : "C"} />
      <StatCard label="Feedback count"   value={stat.total || 0}    tone="slate"   icon="📝" grade="A" />
    </div>
  );
}

function StatCard({ label, value, tone = "slate", icon, grade }) {
  const tones = {
    emerald: "bg-emerald-50/60 border-emerald-200/70 text-emerald-800",
    amber:   "bg-amber-50/60 border-amber-200/70 text-amber-800",
    rose:    "bg-rose-50/60 border-rose-200/70 text-rose-800",
    blue:    "bg-blue-50/60 border-blue-200/70 text-blue-800",
    slate:   "bg-slate-50/60 border-slate-200/70 text-slate-800",
  };
  const gradeStyles = {
    "A+": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "A":  "bg-blue-100 text-blue-700 border-blue-200",
    "B":  "bg-indigo-100 text-indigo-700 border-indigo-200",
    "C":  "bg-amber-100 text-amber-700 border-amber-200",
    "F":  "bg-rose-100 text-rose-700 border-rose-200",
  };

  return (
    <div className={`bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all hover:scale-[1.01]`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{icon}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        </div>
        {grade && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${gradeStyles[grade] || gradeStyles["A"]}`}>
            {grade}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-800">{value}</div>
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
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
        <span>Tickets by Channel (Last 500)</span>
        <span className="text-[11px] text-slate-400 font-normal">Real-time telemetry</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {CHANNELS.map((c) => (
          <div key={c} className="flex items-center gap-3 bg-slate-50 border border-slate-200/60 px-4 py-2 rounded-xl">
            <span className={`text-xs px-2.5 py-0.5 rounded-full ${CHANNEL_META[c].chip}`}>
              {CHANNEL_META[c].label}
            </span>
            <span className="font-mono text-lg font-bold text-slate-800">{counts[c]}</span>
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
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Live Ticket Stream (Click row to view AI analysis)
          </span>
        </div>
        <span className="text-xs text-slate-500 font-mono bg-white px-2.5 py-1 rounded-lg border border-slate-200 font-medium">
          {items.length} tickets ingested
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 bg-slate-50/80 border-b border-slate-100 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">When</th>
              <th className="text-left px-4 py-3">Channel</th>
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Text</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Confidence</th>
              <th className="text-left px-4 py-3">Cluster</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Waiting for incoming tickets…
                </td>
              </tr>
            )}
            {items.map((t, idx) => (
              <>
                <tr
                  key={t.id}
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${idx === 0 ? "animate-fade-in" : ""}`}
                >
                  <td className="px-4 py-3 text-slate-500 text-xs font-medium whitespace-nowrap">
                    {timeAgo(toEpoch(t.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full ${CHANNEL_META[t.channel]?.chip || "bg-slate-100 text-slate-600"}`}>
                      {CHANNEL_META[t.channel]?.label || t.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.user_id}</td>
                  <td className="px-4 py-3 max-w-md truncate font-medium text-slate-800" title={t.text}>{t.text}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full inline-flex items-center gap-1.5 ${STATUS_META[t.status]?.chip || "bg-slate-100 text-slate-600"}`}>
                      <span>{STATUS_META[t.status]?.icon || ""}</span>
                      {STATUS_META[t.status]?.label || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {t.confidence_score !== undefined && t.confidence_score !== null ? (
                      <span className={`px-2 py-0.5 rounded-md text-xs border ${
                        t.confidence_score >= 0.7 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : t.confidence_score >= 0.4 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-rose-50 text-rose-700 border-rose-200"
                      }`}>
                        {pct(t.confidence_score)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {t.cluster_id || "—"}
                  </td>
                </tr>

                {/* Expanded Answer Row */}
                {expandedId === t.id && (
                  <tr key={`${t.id}-exp`} className="bg-slate-50/90">
                    <td colSpan={7} className="p-5">
                      <div className="space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <span>🤖</span> Gemini AI Grounded Answer
                          </span>
                          {t.matched_kb_ids && t.matched_kb_ids.length > 0 && (
                            <span className="text-[11px] bg-white border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-md font-medium shadow-2xs">
                              Cited Sources: {t.matched_kb_ids.join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="bg-white border border-slate-200/80 rounded-xl p-4 text-slate-700 font-sans leading-relaxed whitespace-pre-wrap shadow-xs">
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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Accuracy Trend (Rolling)
        </div>
        <div className="text-slate-400 text-sm h-24 flex items-center justify-center">
          Awaiting feedback telemetry…
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
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
        Accuracy Trend (Rolling)
      </div>
      <svg width={w} height={h} className="block w-full">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={pts} fill="none" stroke="#10b981" strokeWidth="2.5" />
        <line x1="0" y1={h - 0.7 * h} x2={w} y2={h - 0.7 * h} stroke="#cbd5e1" strokeDasharray="3 3" />
      </svg>
      <div className="text-xs text-slate-500 mt-2 font-medium">Last {n} samples — Target SLA ≥ 85%</div>
    </div>
  );
}
