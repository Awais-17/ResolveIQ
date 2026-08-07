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
        `px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
          isActive
            ? "bg-white text-slate-800 shadow-sm border border-slate-200/60 font-semibold"
            : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
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
    <div className="min-h-screen bg-[url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2000&auto=format&fit=crop')] bg-cover bg-center bg-fixed p-3 sm:p-6 lg:p-8 flex flex-col items-center justify-center font-sans antialiased text-slate-800 selection:bg-blue-100 selection:text-blue-900">
      {/* Floating Glassmorphic Container */}
      <div className="w-full max-w-7xl bg-white/85 backdrop-blur-xl border border-white/80 shadow-2xl rounded-3xl overflow-hidden flex flex-col min-h-[90vh] transition-all">
        {/* Sleek Light Header */}
        <header className="border-b border-slate-200/70 bg-white/60 backdrop-blur-md px-6 py-4 sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 text-sm tracking-wide">
              RQ
            </div>
            <div>
              <div className="font-bold text-slate-900 text-base tracking-tight flex items-center gap-2">
                ResolveIQ
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200/60 uppercase tracking-wider">
                  Live Ops
                </span>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Enterprise Autonomous Support Platform
              </div>
            </div>
          </div>

          {/* Capsule Tab Navigation */}
          <nav className="flex items-center gap-1 bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/60 shadow-inner">
            <NavItem to="/" label="Dashboard" />
            <NavItem to="/escalation" label="Escalation Queue" />
          </nav>

          {/* User profile capsule */}
          <div className="flex items-center gap-3 text-xs">
            <div className="bg-slate-100/90 border border-slate-200/80 px-3 py-1.5 rounded-xl font-medium text-slate-700 flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{user?.email}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                {role || "viewer"}
              </span>
            </div>
            <button
              onClick={logout}
              className="text-slate-500 hover:text-slate-800 font-medium hover:bg-slate-100 px-3 py-1.5 rounded-xl transition"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/escalation" element={<ProtectedRoute><Escalation /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Subtle Footer */}
        <footer className="border-t border-slate-200/60 bg-white/40 backdrop-blur-sm text-xs text-slate-500 px-6 py-3 text-center flex flex-wrap justify-between items-center gap-2">
          <span className="font-medium text-slate-600">ResolveIQ · LangGraph + Vertex AI + Firestore</span>
          <span className="text-[11px] text-slate-400">Co-authored with Antigravity AI</span>
        </footer>
      </div>
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
