"use client";

import { useEffect, useRef } from "react";
import { QuoteEditor } from "../editor";
import { useApp } from "../../app-context";
import { newQuote } from "@/lib/state";

/** A quote that does not exist yet. It gets its address once it is saved, and
 *  the editor moves there. */
export default function NewTripPage() {
  const { st, setSt, persist } = useApp();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const next = newQuote(st);
    setSt(next);
    persist(next);
  }, []);

  return <QuoteEditor />;
}
