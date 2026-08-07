import { useState } from "react";
import { ORCHESTRATOR_URL, db } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const CHANNELS = [
  { id: "chat",  label: "Live Chat",  icon: "💬", placeholder: "Hi, I'm getting a 504 on uploads…" },
  { id: "email", label: "Email",      icon: "✉️",  placeholder: "Subject: can't log in to dashboard" },
  { id: "slack", label: "Slack",      icon: "#",   placeholder: "@support uploads are failing for us" },
];

// Pre-built demo questions for the PRD §7 demo flow — click to auto-fill.
const DEMO_QUESTIONS = [
  { label: "📤 504 Upload Error", text: "My cloud storage uploads keep failing with a 504 timeout error", channel: "chat" },
  { label: "📤 Upload Timeout",   text: "I'm getting 504 errors when trying to upload files to cloud storage", channel: "email" },
  { label: "🚨 Upload Down",      text: "504 gateway timeout on every file upload since this morning", channel: "slack" },
  { label: "⚡ Rate Limit v2 API", text: "Why am I getting a rate-limit warning on the v2 API when I'm well under my quota?", channel: "chat" },
  { label: "⚡ Re-ask Rate Limit", text: "I keep seeing rate limit warnings on v2 API despite being under quota", channel: "chat" },
];

export default function ChannelFeeds() {
  const [busy, setBusy] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (channel, text, user_id) => {
    if (!text.trim()) return;
    setBusy(`${channel}:${user_id}`);
    setError(null);
    setLastResult(null);
    try {
      // Write to Firestore first (dashboard sees "Pending" immediately via onSnapshot).
      const docRef = await addDoc(collection(db, "tickets"), {
        channel,
        user_id,
        text: text.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // Always call orchestrator directly — Cloud Functions are not deployed
      // in Hybrid mode. The orchestrator processes the ticket, then writes the
      // result (status, confidence, answer) back to Firestore. The dashboard's
      // onSnapshot listener picks up the update automatically.
      const resp = await fetch(`${ORCHESTRATOR_URL}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticket_id: docRef.id,
          channel,
          user_id,
          text: text.trim(),
        }),
      });

      if (!resp.ok) throw new Error(`Orchestrator returned HTTP ${resp.status}`);
      const data = await resp.json();
      setLastResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Demo Quick Actions ────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-3 flex items-center gap-1.5">
          <span>⚡</span>
          <span>Demo Quick Actions — Ingest Test Queries</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {DEMO_QUESTIONS.map((dq, i) => (
            <button
              key={i}
              disabled={busy !== null}
              onClick={() => submit(dq.channel, dq.text, `u_${dq.channel}_demo_${i + 1}`)}
              className="text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-blue-600 hover:text-white border border-slate-200/80 hover:border-blue-600 text-slate-700 transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {dq.label}
            </button>
          ))}
        </div>

        {/* Processing indicator */}
        {busy && (
          <div className="mt-3.5 flex items-center gap-2 text-xs text-blue-700 font-semibold animate-pulse">
            <span className="inline-block w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Processing ticket via LangGraph & Gemini AI…
          </div>
        )}

        {/* Success result */}
        {lastResult && !busy && (
          <div className="mt-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 text-xs space-y-1 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-base font-bold">✓</span>
              <span className="text-emerald-800 font-bold uppercase tracking-wider">
                {lastResult.status?.replace(/_/g, " ")}
              </span>
              )}
            </div>
            {lastResult.suspected_root_cause && (
              <div className="text-crit-400">
                🚨 Root cause: {lastResult.suspected_root_cause}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && !busy && (
          <div className="mt-3 text-xs text-crit-500 bg-crit-500/10 border border-crit-500/20 rounded-lg p-2">
            ✗ {error}
          </div>
        )}
      </div>

      {/* ─── Manual Channel Inputs ─────────────────────────────────── */}
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
        Or Type a Custom Question into Any Simulated Channel
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHANNELS.map((cfg) => (
          <ChannelForm key={cfg.id} cfg={cfg} busy={busy} error={error} onSubmit={submit} />
        ))}
      </div>
    </div>
  );
}

function ChannelForm({ cfg, busy, error, onSubmit }) {
  const [text, setText] = useState("");
  const [userId, setUserId] = useState(`u_${cfg.id}_demo`);
  const disabled = !text.trim() || busy?.startsWith(`${cfg.id}:`);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(cfg.id, text, userId); setText(""); }}
      className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-colors space-y-3"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-lg border border-slate-200/60">{cfg.icon}</div>
        <div>
          <div className="text-sm font-bold text-slate-800">{cfg.label}</div>
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Simulated Channel</div>
        </div>
      </div>
      <input
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-600 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={cfg.placeholder}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none transition-colors"
      />
      <button
        type="submit"
        disabled={disabled}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold py-2 text-xs rounded-xl transition-all shadow-2xs"
      >
        {busy?.startsWith(`${cfg.id}:`) ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </span>
        ) : `Send to ${cfg.label}`}
      </button>
    </form>
  );
}
