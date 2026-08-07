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
      <div className="bg-gradient-to-r from-brand-600/10 to-violet-600/10 border border-brand-500/20 rounded-xl p-4">
        <div className="text-xs uppercase tracking-wider text-brand-400 mb-3 font-semibold">
          ⚡ Demo Quick Actions — PRD §7 Flow (click to submit)
        </div>
        <div className="flex flex-wrap gap-2">
          {DEMO_QUESTIONS.map((dq, i) => (
            <button
              key={i}
              disabled={busy !== null}
              onClick={() => submit(dq.channel, dq.text, `u_${dq.channel}_demo_${i + 1}`)}
              className="text-xs px-3 py-2 rounded-lg bg-slate-800/80 hover:bg-brand-600/30 border border-slate-700 hover:border-brand-500/50 text-slate-200 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {dq.label}
            </button>
          ))}
        </div>

        {/* Processing indicator */}
        {busy && (
          <div className="mt-3 flex items-center gap-2 text-xs text-brand-400">
            <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            Processing ticket via Gemini…
          </div>
        )}

        {/* Success result */}
        {lastResult && !busy && (
          <div className="mt-3 bg-slate-900/80 border border-ok-500/30 rounded-lg p-3 text-xs space-y-1 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-ok-500 text-base">✓</span>
              <span className="text-ok-400 font-semibold uppercase tracking-wider">
                {lastResult.status?.replace(/_/g, " ")}
              </span>
              {lastResult.confidence != null && (
                <span className="text-slate-400 ml-auto font-mono">
                  Confidence: {Math.round(lastResult.confidence * 100)}%
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
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">
        Or type a custom question into any channel
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
      className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-lg">{cfg.icon}</div>
        <div>
          <div className="text-sm font-medium">{cfg.label}</div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Simulated channel</div>
        </div>
      </div>
      <input
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs mb-2 font-mono focus:border-brand-500 focus:outline-none transition-colors"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={cfg.placeholder}
        className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm focus:border-brand-500 focus:outline-none transition-colors"
      />
      <button
        type="submit"
        disabled={disabled}
        className="mt-2 w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm py-1.5 rounded-lg transition-all"
      >
        {busy?.startsWith(`${cfg.id}:`) ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing…
          </span>
        ) : "Submit"}
      </button>
    </form>
  );
}
