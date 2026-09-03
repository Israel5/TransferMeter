"use client";

import { useRef, useState } from "react";
import { fetchBackup, restoreBackup } from "@/lib/api";

/* A copy of everything, and the way back from a bad day.
 *
 * The file holds every quote, every setting and every corrected distance,
 * including each quote's share token, so a restored quote keeps the link its
 * customer already has. It also holds every customer's name, address and
 * telephone number, which is worth knowing before it goes in a shared folder.
 */

type Peek = {
  quotes: number;
  learned: number;
  settings: boolean;
  exportedAt: string;
  raw: unknown;
};

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "an unknown date" : d.toLocaleString("en-CA");
};

export function BackupPanel({ onRestored }: { onRestored: () => void }) {
  const file = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [replace, setReplace] = useState(false);

  const download = async () => {
    setBusy(true); setMsg(null);
    try {
      const data = await fetchBackup();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transfer-meter-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const n = (data as { quotes?: unknown[] })?.quotes?.length ?? 0;
      setMsg({ text: `Saved — ${n} quote${n === 1 ? "" : "s"}, with your settings and corrected distances.` });
    } catch (e) {
      setMsg({ text: (e as Error).message, bad: true });
    } finally { setBusy(false); }
  };

  /** Read and describe the file before anything is written, so the confirming
   *  is done against what is actually in it rather than its name. */
  const chosen = async (f: File | null) => {
    setMsg(null); setPeek(null); setReplace(false);
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (raw?.app !== "transfer-meter") throw new Error("That is not a Transfer Meter backup.");
      setPeek({
        quotes: Array.isArray(raw.quotes) ? raw.quotes.length : 0,
        learned: Array.isArray(raw.learned) ? raw.learned.length : 0,
        settings: !!raw.settings?.data,
        exportedAt: raw.exportedAt ?? "",
        raw,
      });
    } catch (e) {
      setMsg({ text: (e as Error).message || "That file could not be read.", bad: true });
    }
  };

  const restore = async () => {
    if (!peek) return;
    setBusy(true); setMsg(null);
    try {
      const r = await restoreBackup(peek.raw, replace);
      setPeek(null);
      if (file.current) file.current.value = "";
      setMsg({ text: `Restored ${r.quotes} quote${r.quotes === 1 ? "" : "s"}`
        + `${r.settings ? ", your settings" : ""}`
        + `${r.learned ? ` and ${r.learned} corrected distance${r.learned === 1 ? "" : "s"}` : ""}.`
        + `${r.removed ? ` Removed ${r.removed} that were not in the file.` : ""}` });
      onRestored();
    } catch (e) {
      setMsg({ text: (e as Error).message, bad: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="backup">
      <p className="note">
        A copy of every quote, your settings and your corrected distances, as one file.
        Each quote keeps its link, so restoring one does not break the address its customer
        already has. The file also holds your customers’ names, addresses and phone
        numbers — keep it somewhere you would keep those.
      </p>

      <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
        <button className="btn" type="button" disabled={busy} onClick={download}>
          {busy ? "Working…" : "Download a backup"}
        </button>
        <button className="btn" type="button" disabled={busy}
                onClick={() => file.current?.click()}>
          Choose a backup file…
        </button>
        <input ref={file} type="file" accept="application/json,.json" hidden
               onChange={(e) => chosen(e.target.files?.[0] ?? null)} />
      </div>

      {peek && (
        <div className="backup-peek">
          <p>
            <b>{peek.quotes} quote{peek.quotes === 1 ? "" : "s"}</b>
            {peek.settings ? ", your settings" : ""}
            {peek.learned ? `, ${peek.learned} corrected distance${peek.learned === 1 ? "" : "s"}` : ""}
            {` — saved ${when(peek.exportedAt)}.`}
          </p>
          <p className="note">
            {replace
              ? "Everything not in this file will be deleted — quotes you have added since it was taken, and the numbering will carry on from the file rather than from them."
              : "Adds these and overwrites anything with the same id. Nothing is deleted: a quote that is here but not in the file stays as it is, and keeps its place in the numbering."}
          </p>
          <label className="rq-check" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={replace}
                   onChange={(e) => setReplace(e.target.checked)} />
            <span>Delete anything that is not in this file</span>
          </label>
          <div className="route-actions" style={{ borderTop: 0, paddingTop: 4 }}>
            <button className="btn" type="button" disabled={busy}
                    onClick={() => { setPeek(null); if (file.current) file.current.value = ""; }}>
              Cancel
            </button>
            <button className="btn danger" type="button" disabled={busy} onClick={restore}>
              {busy ? "Restoring…" : replace ? "Replace everything with this backup" : "Restore this backup"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className={"note" + (msg.bad ? " bad" : " good")}>{msg.text}</p>}
    </div>
  );
}
