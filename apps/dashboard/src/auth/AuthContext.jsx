import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getIdTokenResult,
} from "firebase/auth";
import { auth } from "../firebase";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const token = await getIdTokenResult(u);
          setRole(token.claims?.role || "viewer");
        } catch {
          setRole("viewer");
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => signOut(auth);

  return (
    <AuthContext.Provider value={{ user, role, signIn, logout }}>
      {/* Block render until first auth callback fires so protected routes
          don't redirect prematurely. */}
      {!loading && children}
    </AuthContext.Provider>
  );
}
