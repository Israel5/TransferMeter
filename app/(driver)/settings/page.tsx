"use client";

import { SettingsPanel } from "@/components/SettingsPanel";
import { signOut, clearLearned } from "@/lib/api";
import { useApp } from "../app-context";

export default function SettingsPage() {
  const { st, set, signedIn, say, refresh } = useApp();

  return (
    <SettingsPanel
      settings={st.settings}
      learnedCount={Object.keys(st.learned).length}
      quotes={st.quotes}
      onChange={(patch) => set({ settings: { ...st.settings, ...patch } })}
      onClearLearned={() => {
        set({ learned: {} });
        if (signedIn) {
          clearLearned().catch(() =>
            say("Those distances could not be forgotten — they will return on reload."));
        }
      }}
      onRestored={refresh}
      onSignOut={async () => {
        try { await signOut(); } catch { /* the cookie goes either way */ }
        // A full reload, so nothing of the signed-in screen is left in memory.
        location.reload();
      }} />
  );
}
