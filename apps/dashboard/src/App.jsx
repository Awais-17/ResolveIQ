import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Escalation from "./pages/Escalation";
import ProtectedRoute from "./auth/ProtectedRoute";

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-lg text-sm transition ${
          isActive
            ? "bg-brand-600 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function Shell() {
  const { user, role, logout } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold">
              RQ
            </div>
            <div>
              <div className="font-semibold">ResolveIQ</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Live Ops Dashboard
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <NavItem to="/" label="Dashboard" />
            <NavItem to="/escalation" label="Escalation" />
          </nav>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              {user?.email} · <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{role || "viewer"}</span>
            </span>
            <button onClick={logout} className="text-slate-300 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route
            path="/escalation"
            element={<ProtectedRoute><Escalation /></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-800 text-[10px] text-slate-500 px-4 py-2 text-center">
        ResolveIQ · LangGraph + Vertex AI + Firestore · HiDevs AI House Builder Series
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
