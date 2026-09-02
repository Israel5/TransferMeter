"use client";

import { useState } from "react";
import { fmt, money, fuelUsed, legCost, toL100, shortName, shortDay } from "@/lib/quote";
import { owedOn, tipTotal } from "@/lib/state";
import { waLink, waHandle, waPretty } from "@/lib/whatsapp";
import type { Actual, Quote, Settings } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", requested: "Requested", sent: "Sent",
  approved: "Approved", declined: "Declined",
};
const NEXT_STATUS: Record<string, string> = {
  draft: "sent", requested: "sent", sent: "approved", approved: "declined", declined: "draft",
};
/** Anything unrecognised — an older record, a hand-edited row — reads as a
 *  draft rather than rendering an empty pill nobody can interpret. */
const known = (s: string | undefined) =>
  s && STATUS_LABEL[s] ? s : s === "pending" ? "sent" : "draft";

/** What you read off the car after the ride: the odometer, the trip computer's
 *  average, and what you last paid for a litre. Leave any of them blank and the
 *  estimate's own assumption stands, shown greyed in the box so you can always
 *  see what is being assumed on your behalf.
 *
 *  This never touches the fare. The price was agreed before the wheels moved;
 *  measuring the fuel afterwards changes only what the trip cost you. */
function FuelRow({
  actual, estKm, estCost, settings, onChange,
}: {
  actual: Actual | undefined; estKm: number; estCost: number;
  settings: Settings; onChange: (a: Actual) => void;
}) {
  const real = fuelUsed(actual, estKm, settings);
  // Quebec pumps advertise cents: 187.9 on the sign is $1.879 in this box.
  const looksLikeCents = (actual?.price ?? 0) > 10;
  const set = (k: keyof Actual) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    const v = parseFloat(raw);
    const next: Actual = { ...(actual ?? {}) };
    if (raw === "" || !Number.isFinite(v) || v <= 0) delete next[k]; else next[k] = v;
    onChange(next);
  };
  const box = (k: keyof Actual, hint: number, unit: string, decimals: number,
               step: string, title: string) => (
    <span className={"fuel-box" + (actual?.[k] != null ? " has" : "")}>
      <input type="number" min="0" step={step} inputMode="decimal"
             placeholder={hint > 0 ? fmt(hint, decimals) : ""}
             aria-label={title} title={title}
             value={actual?.[k] != null ? String(actual[k]) : ""}
             onChange={set(k)} />
      <span className="u">{unit}</span>
    </span>
  );

  return (
    <div className={"qfuel" + (real ? " measured" : "")}>
      <span className="lab" title="Measured from your door to your door, the whole loop including the empty legs">
        actual
      </span>
      {box("km", estKm, "km", 1, "0.1", "Kilometres actually driven, your door back to your door")}
      {box("l100", toL100(settings.kmPerL), "L/100km", 1, "0.1", "The average your dash showed")}
      {box("price", settings.fuelPrice, "$/L", 2, "0.001", "What you paid per litre, in dollars: the pump's 187.9 is 1.879")}
      {looksLikeCents && (
        <span className="fuel-warn">
          {`that looks like cents — $${fmt((actual?.price ?? 0) / 100, 3)} per litre?`}
        </span>
      )}
      <span className="fuel-out">
        {real ? (
          <>
            <b>{fmt(real.litres, 2)} L · {money(real.cost)}</b>
            <span className="vs">
              {Math.abs(real.cost - estCost) < 0.005
                ? "same as estimated"
                : `estimated ${money(estCost)} for ${fmt(estKm, 1)} km`}
            </span>
          </>
        ) : (
          <span className="vs">
            {`estimated ${money(estCost)} for ${fmt(estKm, 1)} km door to door`}
          </span>
        )}
      </span>
    </div>
  );
}

/** The name leads; everything else supports it. Detail only when asked for. */
export function TripList({
  quotes, settings, onOpen, onDelete, onPdf, onSend, onCopyLink, onRevokeLink, onPatch, onNew,
}: {
  quotes: Quote[]; settings: Settings;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onPdf: (q: Quote) => void;
  onSend: (q: Quote) => void;
  onCopyLink: (q: Quote) => void;
  onRevokeLink: (q: Quote) => void;
  onPatch: (id: string, patch: Partial<Quote>) => void;
  onNew: () => void;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  // Revoking breaks a link already in someone's hands, so it asks first.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const shown = quotes.filter((q) => {
    if (!needle) return true;
    return [q.quoteNo, q.customer, q.contact,
      ...(q.trips ?? []).flatMap((t) => (t.stops ?? []).map((s) => s.name))]
      .join(" ").toLowerCase().includes(needle);
  });

  const counts = ["draft", "requested", "sent", "approved", "declined"]
    .map((s) => [s, quotes.filter((q) => (q.status ?? "draft") === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(" · ");

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <section className="card">
      <div className="card-head">
        <span className="label">Trips</span>
        <span className="unit">{counts}</span>
        <button className="btn primary" type="button" onClick={onNew}>+ New trip</button>
      </div>
      <div className="card-body">
        <input className="saved-search" type="search" placeholder="Search by name, number or place"
               value={filter} onChange={(e) => setFilter(e.target.value)} />

        <ul className="saved-list">
          {shown.map((q) => {
            const st = known(q.status);
            const legs = q.trips ?? [];
            const tips = tipTotal(q);
            const owed = owedOn(q);
            const isOpen = openIds.has(q.id);
            const dates = legs.filter((t) => t.date).map((t) => shortDay(t.date));
            const named = (legs[0]?.stops ?? [])
              .filter((s) => !s.base && String(s.name || "").trim()).map((s) => shortName(s.name));
            const chat = waLink(q.contact, "", settings);

            return (
              <li key={q.id} className={`qcard is-${st}${isOpen ? " open" : ""}`}>
                <button type="button" className="qhead" aria-expanded={isOpen} onClick={() => toggle(q.id)}>
                  <span className="qmain">
                    <span className="qname">{q.customer || "(no name)"}</span>
                    <span className="qmeta">
                      <span className="no">{q.quoteNo ? `#${q.quoteNo}` : ""}</span>
                      {(q.quoteNo ? "  ·  " : "")
                        + (dates.length ? dates.join(" → ") + "  ·  " : "")
                        + (named[0] ?? "—") + " → " + (named[named.length - 1] ?? "—")
                        + (legs.length > 1 ? "  ·  round trip" : "")
                        + ((q.notes ?? "").trim() ? "  ·  note" : "")}
                    </span>
                  </span>
                  <span className="qmoney">
                    <span className="qprice">${fmt(q.price, 0)}</span>
                    <span className="qtip">{tips > 0 ? `+$${fmt(tips, 0)} tip` : ""}</span>
                    <span className="qowed">{owed > 0 ? `$${fmt(owed, 0)} owed` : ""}</span>
                  </span>
                  <span
                    className={"status" + (st === "draft" ? "" : ` ${st}`)}
                    role="button" tabIndex={0} title="Click to change"
                    onClick={(e) => { e.stopPropagation(); onPatch(q.id, { status: NEXT_STATUS[st] as Quote["status"] }); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation(); e.preventDefault();
                        onPatch(q.id, { status: NEXT_STATUS[st] as Quote["status"] });
                      }
                    }}
                  >{STATUS_LABEL[st]}</span>
                  <span className="qchev">▾</span>
                </button>

                <div className="qbody" hidden={!isOpen}>
                  {legs.map((t, n) => {
                    const ns = (t.stops ?? [])
                      .filter((s) => !s.base && String(s.name || "").trim()).map((s) => shortName(s.name));
                    return (
                    <div key={n} className="qlegwrap">
                      <div className="qleg">
                        <span className="lab">{legs.length > 1 ? (t.label === "Return" ? "Return" : "Out") : "Trip"}</span>
                        <span className="when">{(t.date ? shortDay(t.date) : "no date") + (t.time ? ` ${t.time}` : "")}</span>
                        <span className="path">
                          {(ns[0] ?? "—") + " → " + (ns[ns.length - 1] ?? "—") + "  ·  "
                            + fmt(t.paxKm ?? t.totalKm, 0) + " km with passenger"
                            + ((t.totalKm ?? 0) > (t.paxKm ?? 0)
                                ? `, ${fmt(t.totalKm ?? 0, 0)} km driven`
                                : "")}
                        </span>
                        <span className="fare">${fmt(t.price, 0)}</span>
                        <button type="button" className={"paidbtn" + (t.paid ? " yes" : "")}
                                title={t.paid ? "Paid — click to mark unpaid" : "Not paid yet"}
                                onClick={() => {
                                  const trips = legs.map((x, i) => i === n ? { ...x, paid: !x.paid } : x);
                                  onPatch(q.id, { trips });
                                }}>
                          {t.paid ? "Paid" : "Unpaid"}
                        </button>
                        <span className={"tip-field" + ((t.tip ?? 0) > 0 ? " has" : "")}>
                          <span className="cur">tip +$</span>
                          <input type="number" min="0" step="1" inputMode="decimal" placeholder="0"
                                 aria-label={`Tip for ${q.customer || "this leg"}`}
                                 value={t.tip ? String(t.tip) : ""}
                                 onChange={(e) => {
                                   const v = parseFloat(e.target.value);
                                   const trips = legs.map((x, i) =>
                                     i === n ? { ...x, tip: Number.isFinite(v) && v > 0 ? v : 0 } : x);
                                   onPatch(q.id, { trips });
                                 }} />
                        </span>
                      </div>
                      <FuelRow
                        actual={t.actual}
                        estKm={t.totalKm ?? 0}
                        estCost={t.cost ?? 0}
                        settings={settings}
                        onChange={(actual) => {
                          const trips = legs.map((x, i) =>
                            i === n
                              ? { ...x, actual: Object.keys(actual).length ? actual : undefined }
                              : x);
                          onPatch(q.id, { trips });
                        }} />
                    </div>
                    );
                  })}

                  <textarea className="qnote" placeholder="Private notes about this trip or customer…"
                            aria-label={`Notes for ${q.customer || "this quote"}`}
                            value={q.notes ?? ""}
                            onChange={(e) => onPatch(q.id, { notes: e.target.value })} />

                  <div className="qacts">
                    {chat
                      ? <a className="wa" href={chat} target="_blank" rel="noopener"
                           title={`Open the chat with ${waPretty(q.contact, settings)}`}>WhatsApp</a>
                      : waHandle(q.contact)
                        ? <span className="chip">{waPretty(q.contact, settings)}</span>
                        : null}
                    <span className="spacer" />
                    <button className="qbtn" type="button" onClick={() => onSend(q)}>Send</button>
                    <button className="qbtn" type="button" title="Copy the customer's link"
                            onClick={() => onCopyLink(q)}>Copy link</button>
                    {q.shareToken && (
                      confirming === q.id ? (
                        <button className="qbtn danger" type="button"
                                title="The link already sent will stop working"
                                onClick={() => { setConfirming(null); onRevokeLink(q); }}>
                          Break the old link?
                        </button>
                      ) : (
                        <button className="qbtn" type="button"
                                title="Issue a new link and disable the one already sent"
                                onClick={() => {
                                  setConfirming(q.id);
                                  setTimeout(() => setConfirming((c) => (c === q.id ? null : c)), 4000);
                                }}>
                          Revoke link
                        </button>
                      )
                    )}
                    <button className="qbtn" type="button" onClick={() => onOpen(q.id)}>Open</button>
                    <button className="qbtn" type="button" onClick={() => onPdf(q)}>PDF</button>
                    <button className="qbtn danger" type="button" onClick={() => onDelete(q.id)}>Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="empty" hidden={shown.length > 0}>
          {quotes.length ? "No trip matches that search."
                         : "No trips yet. Press + New trip to quote your first one."}
        </p>
      </div>
    </section>
  );
}
