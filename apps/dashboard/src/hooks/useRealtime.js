import { useEffect, useRef, useState } from "react";
import {
  collection,
  query,
  limit,
  onSnapshot,
  where,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

function toEpoch(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  return new Date(ts).getTime() || 0;
}

function useCollection(path, buildQuery, deps = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const buf = useRef([]);
  const flushTimer = useRef(null);

  useEffect(() => {
    const baseRef = collection(db, path);
    const q = buildQuery(baseRef);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort in memory by createdAt descending to avoid missing index errors
        raw.sort((a, b) => toEpoch(b.createdAt) - toEpoch(a.createdAt));
        buf.current = raw;
        if (flushTimer.current) return;
        flushTimer.current = setTimeout(() => {
          setItems(buf.current);
          setLoading(false);
          flushTimer.current = null;
        }, 150);
      },
      (err) => {
        console.error("useCollection error:", path, err);
        setLoading(false);
      }
    );
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { items, loading };
}

export function useTickets({ statusFilter, limit: lim = 100 } = {}) {
  return useCollection("tickets", (ref) => {
    let q = ref;
    if (statusFilter) {
      q = query(q, where("status", "==", statusFilter));
    }
    q = query(q, limit(lim));
    return q;
  }, [statusFilter, lim]);
}

export function useIncidents() {
  return useCollection(
    "incident_clusters",
    (ref) => query(ref, where("status", "==", "active"), limit(50)),
    []
  );
}

export function useKBArticles() {
  return useCollection(
    "kb_articles",
    (ref) => query(ref, limit(50)),
    []
  );
}

export function useEscalations() {
  return useCollection(
    "tickets",
    (ref) =>
      query(
        ref,
        where("status", "==", "escalated"),
        limit(50)
      ),
    []
  );
}

export function useAccuracyTrend() {
  const [stat, setStat] = useState({
    correct: 0,
    wrong: 0,
    total: 0,
    accuracy: 0,
    samples: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "stats", "accuracy"),
      (snap) => {
        if (snap.exists()) {
          setStat(snap.data());
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { stat, loading };
}
