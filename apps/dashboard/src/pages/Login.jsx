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
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-slate-900/70 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-5"
      >
        <div>
          <h1 className="text-2xl font-semibold">ResolveIQ</h1>
          <p className="text-sm text-slate-400">Support agent sign-in</p>
        </div>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-400">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-slate-400">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
          />
        </label>
        {error && <div className="text-sm text-crit-500">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
