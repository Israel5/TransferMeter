"use client";

import { useRouter } from "next/navigation";
import { Editor } from "@/components/Editor";
import { useApp } from "../app-context";
import { draftMessage } from "@/lib/message";
import { loadQuote } from "@/lib/state";
import type { Quote } from "@/lib/types";

/** The quote editor, shared by /trips/new and /trips/[id].
 *
 *  Saving a new quote gives it an id, and the editor moves to its own address:
 *  reload after that and you are still on the quote you were writing, which is
 *  the whole point of the page having one. */
export function QuoteEditor() {
  const { st, setSt, persist, live, set, setTrip, mapsLeg, mapsRoute, flash,
          saveNow, savePdf, sendQuote, copyLink } = useApp();
  const router = useRouter();

  /** A quote that has just been created has an address now; go to it, so a
   *  reload lands back on the quote rather than on a blank new one. */
  const settle = (saved: Quote | null) => {
    if (saved && saved.id !== st.editingId) router.replace(`/trips/${saved.id}`);
    return saved;
  };

  return (
    <Editor st={st} live={live} set={set} setTrip={setTrip}
            mapsLeg={mapsLeg} mapsRoute={mapsRoute}
            quoteText={draftMessage(st)}
            onSave={async () => { settle(await saveNow()); }}
            onSend={async () => { const q = settle(await saveNow()); if (q) await sendQuote(q); }}
            onPdf={async () => { const q = settle(await saveNow()); if (q) savePdf(q); }}
            onCopyLink={async () => { const q = settle(await saveNow()); if (q) await copyLink(q); }}
            onDiscard={() => {
              // Back to the quote as stored. Nothing else is touched, and a
              // quote that was never saved has nothing to go back to.
              if (st.editingId == null) return;
              const next = loadQuote(st, st.editingId);
              setSt(next);
              persist(next);
            }}
            onNewQuote={() => router.push("/trips/new")}
            onBack={() => router.push("/trips")}
            flash={flash} />
  );
}
