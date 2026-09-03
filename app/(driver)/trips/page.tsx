"use client";

import { useRouter } from "next/navigation";
import { TripList } from "@/components/TripList";
import { useApp } from "../app-context";

export default function TripsPage() {
  const { st, doDelete, savePdf, sendQuote, copyLink, revokeLink, patchQuote } = useApp();
  const router = useRouter();

  return (
    <TripList quotes={st.quotes} settings={st.settings}
              onOpen={(id) => router.push(`/trips/${id}`)}
              onDelete={doDelete} onPdf={savePdf} onSend={sendQuote} onCopyLink={copyLink}
              onRevokeLink={revokeLink} onPatch={patchQuote}
              onNew={() => router.push("/trips/new")} />
  );
}
