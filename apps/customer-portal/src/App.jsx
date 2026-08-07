import { useState, useEffect, useRef } from "react";
import { db, ORCHESTRATOR_URL } from "./firebase";
import { collection, addDoc, serverTimestamp, doc, onSnapshot } from "firebase/firestore";

const QUICK_PROMPTS = [
  { label: "🍕 Sunday Hours", text: "What are your opening hours on Sunday?" },
  { label: "📤 504 Upload Error", text: "My cloud storage uploads keep failing with a 504 timeout error" },
  { label: "🧀 Vegan Cheese (New)", text: "Do you offer gluten-free vegan cheese crust?" },
  { label: "⚡ Rate Limit v2 API", text: "Why am I getting a rate-limit warning on the v2 API when I'm under quota?" },
];

function cleanAnswerText(rawText) {
  if (!rawText) return "";
  let txt = rawText;
  if (txt.includes("## Resolution")) {
    txt = txt.split("## Resolution")[1] || txt;
  }
  return txt.replace(/^#+\s*/gm, "").trim();
}

export default function App() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      sender: "bot",
      text: "Hi there! 👋 I'm ResolveIQ AI. Ask me any question about our services, menu, or technical support!",
      status: "auto_resolved",
      time: "Just now",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateMessageFromData = (ticketId, data) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.ticketId !== ticketId) return msg;

        const ans = cleanAnswerText(data.answer || data.resolution_text);

        if (data.status === "auto_resolved") {
          return {
            ...msg,
            text: ans || "Answer generated successfully.",
            status: "auto_resolved",
            confidence: data.confidence_score ?? data.confidence,
            cited: data.matched_kb_ids ?? data.cited_chunks,
          };
        } else if (data.status === "human_resolved") {
          return {
            ...msg,
            text: `👤 Manager Answer:\n${ans || "Resolved by manager."}\n\n🧠 ResolveIQ has learned this answer for all future customers!`,
            status: "human_resolved",
          };
        } else if (data.status === "incident_flagged") {
          return {
            ...msg,
            text: ans
              ? ans
              : "🚨 System Incident Flagged: Multiple customers reported similar issues. Our engineering team is investigating.",
            status: "auto_resolved",
            confidence: data.confidence_score ?? data.confidence,
            cited: data.matched_kb_ids ?? data.cited_chunks,
          };
        } else if (data.status === "escalated") {
          return {
            ...msg,
            text: "⚠️ I don't have this exact answer in my Knowledge Base yet! I've sent your question to our Support Manager. Once they answer, it will appear right here and I will learn it for next time!",
            status: "escalated",
            draftedReply: data.drafted_reply,
          };
        }
        return msg;
      })
    );
  };

  const sendQuestion = async (questionText) => {
    const text = questionText || input;
    if (!text.trim() || busy) return;

    setBusy(true);
    if (!questionText) setInput("");

    const userMsgId = `usr_${Date.now()}`;
    const newMsg = {
      id: userMsgId,
      sender: "user",
      text: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, newMsg]);

    try {
      // 1. Write ticket to Firestore
      const docRef = await addDoc(collection(db, "tickets"), {
        channel: "chat",
        user_id: "u_friend_demo",
        text: text.trim(),
        status: "pending",
        createdAt: serverTimestamp(),
      });

      const ticketId = docRef.id;

      // Add temporary loading bot message
      const botMsgId = `bot_${ticketId}`;
      setMessages((prev) => [
        ...prev,
        {
          id: botMsgId,
          sender: "bot",
          ticketId: ticketId,
          text: "Thinking...",
          status: "pending",
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      // 2. Listen to real-time Firestore updates on this ticket document
      onSnapshot(doc(db, "tickets", ticketId), (snap) => {
        if (!snap.exists()) return;
        updateMessageFromData(ticketId, snap.data());
      });

      // 3. POST to Orchestrator API
      const resp = await fetch(`${ORCHESTRATOR_URL}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId,
          channel: "chat",
          user_id: "u_friend_demo",
          text: text.trim(),
        }),
      });

      if (resp.ok) {
        const resultData = await resp.json();
        updateMessageFromData(ticketId, resultData);
      }
    } catch (err) {
      console.error("Error sending question:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-6">
      {/* ─── Header ────────────────────────────────────────────────── */}
      <header className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-4 mb-4 backdrop-blur shadow-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-violet-600 flex items-center justify-center text-xl font-bold shadow-lg">
            🍕
          </div>
          <div>
            <h1 className="font-bold text-base md:text-lg flex items-center gap-2">
              Pizza Express & Customer Portal
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Powered by <span className="text-brand-400 font-semibold">ResolveIQ AI</span> (Gemini 2.5 Flash + Self-Learning RAG)
            </p>
          </div>
        </div>

        <div className="text-right text-xs hidden sm:block">
          <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full font-medium">
            ● AI Online & Learning
          </span>
        </div>
      </header>

      {/* ─── Chat Window ────────────────────────────────────────────── */}
      <main className="w-full max-w-3xl flex-1 bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 md:p-6 flex flex-col justify-between overflow-hidden shadow-2xl mb-4">
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 max-h-[60vh]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.sender === "user" ? "items-end" : "items-start"
              } animate-fade-in`}
            >
              <div className="text-[10px] text-slate-500 mb-1 px-1">
                {msg.sender === "user" ? "You" : "ResolveIQ AI"} · {msg.time}
              </div>

              <div
                className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                  msg.sender === "user"
                    ? "bg-brand-600 text-white rounded-br-none"
                    : msg.status === "escalated"
                    ? "bg-amber-950/40 border border-amber-500/30 text-amber-200 rounded-bl-none"
                    : msg.status === "human_resolved"
                    ? "bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 rounded-bl-none"
                    : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
                }`}
              >
                {msg.status === "pending" ? (
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"></span>
                    Gemini is thinking...
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                )}

                {/* Metadata badges for AI responses */}
                {msg.sender === "bot" && msg.status !== "pending" && (
                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400 gap-2">
                    {msg.status === "auto_resolved" && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        ✓ Auto-Resolved by Gemini
                        {msg.confidence != null && (
                          <span className="font-mono text-slate-400">
                            ({Math.round(msg.confidence * 100)}% match)
                          </span>
                        )}
                      </span>
                    )}

                    {msg.status === "escalated" && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        ⏱️ Sent to Support Manager
                      </span>
                    )}

                    {msg.status === "human_resolved" && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        🧠 Self-Learned & Saved to KB
                      </span>
                    )}

                    {msg.cited && msg.cited.length > 0 && (
                      <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {msg.cited[0]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2 font-semibold flex items-center gap-1">
            <span>⚡ Try these sample questions:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                disabled={busy}
                onClick={() => sendQuestion(qp.text)}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-brand-600/20 border border-slate-800 hover:border-brand-500/50 text-slate-300 hover:text-white transition-all disabled:opacity-50"
              >
                {qp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion();
          }}
          className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 focus-within:border-brand-500 transition-colors"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your question here... (e.g. Do you have vegan cheese crust?)"
            className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none text-slate-100 placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all shadow-lg flex items-center gap-2 shrink-0"
          >
            {busy ? "Sending..." : "Send"}
          </button>
        </form>
      </main>

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <footer className="text-center text-[11px] text-slate-500">
        ResolveIQ AI Customer Portal · Built with Gemini 2.5 Flash + LangGraph + Firestore
      </footer>
    </div>
  );
}
