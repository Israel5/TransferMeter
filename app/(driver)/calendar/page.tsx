"use client";

import { Calendar } from "@/components/Calendar";
import { useApp } from "../app-context";

export default function CalendarPage() {
  const { st, patchQuote } = useApp();
  return <Calendar quotes={st.quotes} settings={st.settings} onPatch={patchQuote} />;
}
