import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = location.state?.from?.pathname || "/";

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white/90 backdrop-blur-xl border border-white/80 rounded-3xl p-8 shadow-2xl space-y-5"
      >
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 mx-auto text-lg mb-3">
            RQ
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">ResolveIQ</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Support Agent Sign-In</p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
          <input
            type="email"
            required
            placeholder="agent@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all shadow-2xs"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Password</span>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all shadow-2xs"
          />
        </label>
        {error && <div className="text-xs text-rose-600 font-medium text-center bg-rose-50 border border-rose-200 rounded-xl p-2.5">✗ {error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-all shadow-md shadow-blue-500/20 hover:scale-[1.01]"
        >
          {busy ? "Signing in…" : "Sign in to Ops"}
        </button>
      </form>
    </div>
  );
}
