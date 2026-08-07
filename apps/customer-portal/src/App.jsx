import { useState, useEffect, useRef } from "react";
import { db, ORCHESTRATOR_URL } from "./firebase";
import { collection, addDoc, serverTimestamp, doc, onSnapshot, updateDoc } from "firebase/firestore";

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

        try {
          await updateDoc(doc(db, "tickets", ticketId), {
            status: resultData.status || "escalated",
            answer: resultData.answer || "",
            confidence_score: resultData.confidence ?? 0,
            drafted_reply: resultData.drafted_reply || "",
            human_context_bundle: resultData.human_context_bundle || null,
            updatedAt: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to update ticket in Firestore:", e);
        }
      }
    } catch (err) {
      console.error("Error sending question:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center bg-fixed p-3 sm:p-6 lg:p-8 flex flex-col items-center justify-center font-sans antialiased text-slate-800 selection:bg-blue-100 selection:text-blue-900">
      {/* Floating Glassmorphic Container */}
      <div className="w-full max-w-4xl bg-white/85 backdrop-blur-xl border border-white/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col min-h-[85vh] p-6 transition-all">
        {/* ─── Header ────────────────────────────────────────────────── */}
        <header className="w-full bg-white/80 border border-slate-200/80 rounded-2xl p-4 mb-5 backdrop-blur shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-2xl text-white shadow-md shadow-blue-500/20">
              🍕
            </div>
            <div>
              <h1 className="font-bold text-base md:text-lg text-slate-900 flex items-center gap-2 tracking-tight">
                Customer Support Portal
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Powered by <span className="text-blue-700 font-bold">ResolveIQ AI</span> (Gemini 2.5 Flash + Self-Learning RAG)
              </p>
            </div>
          </div>

          <div className="text-right text-xs hidden sm:block">
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full font-semibold">
              ● AI Online & Learning
            </span>
          </div>
        </header>

        {/* ─── Chat Window ────────────────────────────────────────────── */}
        <main className="w-full flex-1 bg-white border border-slate-200/80 rounded-2xl p-4 md:p-6 flex flex-col justify-between overflow-hidden shadow-sm mb-4">
          {/* Messages List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 max-h-[55vh]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                } animate-fade-in`}
              >
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 px-1">
                  {msg.sender === "user" ? "You" : "ResolveIQ AI"} · {msg.time}
                </div>

                <div
                  className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-none font-medium"
                      : msg.status === "escalated"
                      ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-bl-none font-medium"
                      : msg.status === "human_resolved"
                      ? "bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-bl-none font-medium"
                      : "bg-slate-50 border border-slate-200/80 text-slate-800 rounded-bl-none"
                  }`}
                >
                  {msg.status === "pending" ? (
                    <div className="flex items-center gap-2 text-slate-500 font-medium">
                      <span className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                      Gemini AI is generating answer…
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap font-sans">{msg.text}</div>
                  )}

                  {/* Metadata badges for AI responses */}
                  {msg.sender === "bot" && msg.status !== "pending" && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500 gap-2">
                      {msg.status === "auto_resolved" && (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          ✓ Auto-Resolved by Gemini
                          {msg.confidence != null && (
                            <span className="font-mono text-slate-500">
                              ({Math.round(msg.confidence * 100)}% match)
                            </span>
                          )}
                        </span>
                      )}

                      {msg.status === "escalated" && (
                        <span className="text-amber-700 font-semibold flex items-center gap-1">
                          ⏱️ Sent to Support Manager
                        </span>
                      )}

                      {msg.status === "human_resolved" && (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          🧠 Self-Learned & Saved to KB
                        </span>
                      )}

                      {msg.cited && msg.cited.length > 0 && (
                        <span className="font-mono bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium text-[10px]">
                          Cited: {msg.cited[0]}
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
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-bold flex items-center gap-1">
              <span>⚡ Try Sample Questions:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp, i) => (
                <button
                  key={i}
                  disabled={busy}
                  onClick={() => sendQuestion(qp.text)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-600 hover:text-white border border-slate-200/80 hover:border-blue-600 text-slate-700 transition-all shadow-2xs disabled:opacity-50"
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
            className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 rounded-2xl p-2 focus-within:bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your question here... (e.g. My uploads keep failing with 504 error)"
              className="flex-1 bg-transparent px-3 py-2 text-sm focus:outline-none text-slate-800 placeholder-slate-400 font-medium"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 shrink-0"
            >
              {busy ? "Sending..." : "Send Question"}
            </button>
          </form>
        </main>

        {/* ─── Footer ────────────────────────────────────────────────── */}
        <footer className="text-center text-xs text-slate-500 font-medium">
          ResolveIQ AI Customer Portal · Built with Gemini 2.5 Flash + LangGraph + Firestore
        </footer>
      </div>
    </div>
  );
}
