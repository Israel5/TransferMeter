"use client";

import { useState } from "react";
import { fmt, dur, scheduleFor } from "@/lib/quote";
import { customerEnds } from "@/lib/reminders";
import { waPretty } from "@/lib/whatsapp";
import type { Lang, Quote, SavedTrip, Settings, Trip } from "@/lib/types";

/* What today and tomorrow actually ask of you.
 *
 * The trips list answers "what have I quoted"; this answers "where do I need to
 * be, and who have I told". Ordered by pick-up time, with the time you have to
 * leave worked out from the drive to their door -- which is the number that
 * decides whether you are late.
 */

export type Run = {
  quote: Quote;
  trip: SavedTrip;
  legIndex: number;
  leave: Date | null;
  pickup: Date | null;
};

const hhmm = (d: Date | null) =>
  d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "—";

/** Local date, never UTC: a trip at 21:40 must not land on tomorrow. */
export function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every leg happening on one day, soonest first. A quote the customer has not
 *  answered still appears -- a trip tomorrow nobody confirmed is exactly the
 *  one you want to see. */
export function runsOn(quotes: Quote[], day: string, s: Settings, learned: Record<string, number>): Run[] {
  const out: Run[] = [];
  (quotes ?? []).forEach((q) => {
    const st = q.status ?? "draft";
    if (st === "draft" || st === "declined") return;
    (q.trips ?? []).forEach((trip, legIndex) => {
      if (trip.date !== day) return;
      const asTrip: Trip = {
        label: trip.label, date: trip.date, time: trip.time,
        stops: trip.stops ?? [],
        liveLegs: (trip.legKm ?? []).map((km) => ({ km: Number(km) || 0, mins: NaN })),
        priceOverride: trip.price ?? null,
      };
      const sch = scheduleFor(asTrip, s, learned);
      out.push({ quote: q, trip, legIndex, leave: sch?.leave ?? null, pickup: sch?.pickup ?? null });
    });
  });
  return out.sort((a, b) => (a.trip.time || "99:99").localeCompare(b.trip.time || "99:99"));
}

function Block({
  title, subtitle, runs, kind, settings, onRemind, onOpen,
}: {
  title: string; subtitle: string; runs: Run[];
  kind: "before" | "onway";
  settings: Settings;
  onRemind: (r: Run, kind: "before" | "onway", lang: Lang) => void;
  onOpen: (id: string) => void;
}) {
  // Which language each message goes out in. Starts as the one the quote was
  // written in, because that is usually right, and is one tap to change.
  const [lang, setLang] = useState<Record<string, Lang>>({});

  return (
    <section className="dash-block">
      <div className="dash-head">
        <h2>{title}</h2>
        <span className="dash-count">{runs.length === 0 ? subtitle : `${runs.length} · ${subtitle}`}</span>
      </div>

      {runs.length === 0 ? (
        <p className="dash-empty">Nothing booked.</p>
      ) : (
        <ul className="dash-list">
          {runs.map((r) => {
            const { from, to } = customerEnds(r.trip);
            const key = `${r.quote.id}:${r.legIndex}`;
            const say = lang[key] ?? r.quote.lang ?? "pt";
            const sent = kind === "before" ? r.trip.remindedAt : r.trip.onWayAt;
            const unanswered = (r.quote.status ?? "draft") !== "approved";
            return (
              <li key={`${r.quote.id}:${r.legIndex}`} className="dash-run">
                <div className="dash-when">
                  <b>{r.trip.time || "—"}</b>
                  <span>{r.leave ? `leave ${hhmm(r.leave)}` : ""}</span>
                </div>

                <div className="dash-who">
                  <button type="button" className="dash-name" onClick={() => onOpen(r.quote.id)}>
                    {r.quote.customer || "(no name)"}
                  </button>
                  <span className="dash-route">{from} → {to}</span>
                  <span className="dash-meta">
                    {[
                      r.trip.label === "Return" ? "return" : "outbound",
                      `${fmt(r.trip.paxKm ?? r.trip.totalKm ?? 0, 0)} km`,
                      r.trip.paxMins ? dur(r.trip.paxMins) : "",
                      r.quote.contact ? waPretty(r.quote.contact, settings) : "",
                    ].filter(Boolean).join("  ·  ")}
                  </span>
                </div>

                <div className="dash-acts">
                  {unanswered && <span className="dash-flag">not confirmed</span>}
                  <span className="dash-langs">
                    {(["pt", "en", "fr"] as const).map((c) => (
                      <button key={c} type="button" aria-pressed={say === c}
                              title={`Send in ${{ pt: "Portuguese", en: "English", fr: "French" }[c]}`}
                              onClick={() => setLang((m) => ({ ...m, [key]: c }))}>
                        {c.toUpperCase()}
                      </button>
                    ))}
                  </span>
                  <button type="button" className={"dash-btn" + (sent ? " done" : "")}
                          onClick={() => onRemind(r, kind, say)}
                          title={sent ? `Already sent ${new Date(sent).toLocaleString("en-CA")}` : undefined}>
                    {kind === "before"
                      ? (sent ? "Reminded" : "Remind")
                      : (sent ? "Told them" : "On my way")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function Dashboard({
  quotes, settings, learned, onRemind, onOpen,
}: {
  quotes: Quote[]; settings: Settings; learned: Record<string, number>;
  onRemind: (r: Run, kind: "before" | "onway", lang: Lang) => void;
  onOpen: (id: string) => void;
}) {
  const today = runsOn(quotes, isoDay(0), settings, learned);
  const tomorrow = runsOn(quotes, isoDay(1), settings, learned);

  return (
    <div className="dash">
      <Block title="Today" subtitle="tell them you've left"
             runs={today} kind="onway" settings={settings}
             onRemind={onRemind} onOpen={onOpen} />
      <Block title="Tomorrow" subtitle="remind them"
             runs={tomorrow} kind="before" settings={settings}
             onRemind={onRemind} onOpen={onOpen} />
    </div>
  );
}
