"use client";

import { useRouter } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { useApp } from "../app-context";

export default function TodayPage() {
  const { st, remind, nudge, markPaid } = useApp();
  const router = useRouter();
  return (
    <Dashboard quotes={st.quotes} settings={st.settings} learned={st.learned}
               onRemind={remind} onNudge={nudge} onPaid={markPaid}
               onOpen={(id) => router.push(`/trips/${id}`)} />
  );
}
