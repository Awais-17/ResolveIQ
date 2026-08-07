import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function ProtectedRoute({ children, requireRole }) {
  const { user, role } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (requireRole && role !== requireRole) return <Navigate to="/" replace />;
  return children;
}
