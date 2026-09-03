"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { QuoteEditor } from "../editor";
import { useApp } from "../../app-context";
import { loadQuote } from "@/lib/state";

/** One quote, addressed by its id. Opening the page loads it; the id in the
 *  URL is the only thing that says which. */
export default function EditTripPage() {
  const { st, setSt, persist } = useApp();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params?.id);

  const known = st.quotes.some((q) => q.id === id);
  const loaded = st.editingId === id;

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) { router.replace("/trips"); return; }
    // Wait for the quotes to arrive before deciding it is not there: a reload
    // straight onto this address has nothing loaded yet.
    if (!st.quotes.length) return;
    if (!known) { router.replace("/trips"); return; }
    if (!loaded) {
      const next = loadQuote(st, id);
      setSt(next);
      persist(next);
    }
  }, [id, known, loaded, st.quotes.length]);

  if (!loaded) return <div className="wrap" />;
  return <QuoteEditor />;
}
