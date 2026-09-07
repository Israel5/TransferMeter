"use client";

import { useState } from "react";
import { fmt, dur, scheduleFor, shortDay, shortName } from "@/lib/quote";
import { customerStops, wazeLink } from "@/lib/waze";
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

/** A saved leg, back in the shape the calculations take. */
const toTrip = (trip: SavedTrip): Trip => ({
  label: trip.label, date: trip.date, time: trip.time,
  stops: trip.stops ?? [],
  liveLegs: (trip.legKm ?? []).map((km) => ({ km: Number(km) || 0, mins: NaN })),
  priceOverride: trip.price ?? null,
});

/** Local date, never UTC: a trip at 21:40 must not land on tomorrow. */
export function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Trips you have already driven and have not been paid for.
 *
 *  Only ones whose day has passed: a booking next month is work in the diary,
 *  not a debt, and mixing the two turns a number you should act on into one
 *  you learn to ignore. Oldest first, because that is the one to ask about.
 */
/** When a leg was over: the customer out of the car and the fare due.
 *
 *  Preferably the arrival the schedule works out. Failing that -- a leg with no
 *  distances yet -- the pick-up plus however long the journey takes. Failing
 *  that too, the end of the day it was on, so a past date still counts as
 *  finished while today's does not. Null when there is not even a date. */
export function finishedAt(
  trip: SavedTrip, s: Settings, learned: Record<string, number>,
): Date | null {
  if (!trip.date) return null;

  // Every step is checked for being a real date. An arrival worked out from
  // half-filled settings comes back as Invalid Date, whose getTime() is NaN,
  // and NaN is not greater than now -- so an unchecked one would report every
  // future trip as already driven and owed for.
  const real = (d: Date | null | undefined) =>
    d && Number.isFinite(d.getTime()) ? d : null;

  const arrive = real(scheduleFor(toTrip(trip), s, learned)?.arrive);
  if (arrive) return arrive;

  if (trip.time) {
    const start = real(new Date(`${trip.date}T${trip.time}`));
    if (start) {
      const mins = Number(trip.paxMins) || Number(trip.mins) || 0;
      return real(new Date(start.getTime() + mins * 60000));
    }
  }

  const [y, m, d] = trip.date.split("-").map(Number);
  return y ? new Date(y, m - 1, d, 23, 59, 59) : null;
}

/** Trips already driven and not paid for.
 *
 *  Driven, not merely dated before today: a fare is due when the customer is
 *  out of the car, so this morning's airport run belongs here by lunchtime.
 *  A trip still ahead of its arrival does not, however much it is worth. */
export function owedRuns(quotes: Quote[], s: Settings, learned: Record<string, number>): Run[] {
  const now = Date.now();
  const out: Run[] = [];
  (quotes ?? []).forEach((q) => {
    if ((q.status ?? "draft") !== "approved") return;
    (q.trips ?? []).forEach((trip, legIndex) => {
      if (trip.paid) return;
      const done = finishedAt(trip, s, learned);
      if (!done || !(done.getTime() <= now)) return;
      out.push({ quote: q, trip, legIndex, leave: null, pickup: null });
    });
  });
  // Oldest first: that is the one to ask about.
  return out.sort((a, b) =>
    (a.trip.date + (a.trip.time || "")).localeCompare(b.trip.date + (b.trip.time || "")));
}

/** How long ago, in the words you would use out loud. */
function daysAgo(date: string): string {
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y) return "";
  const then = new Date(y, m - 1, d), now = new Date();
  const days = Math.round((now.setHours(0, 0, 0, 0) - then.setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
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
      const sch = scheduleFor(toTrip(trip), s, learned);
      out.push({ quote: q, trip, legIndex, leave: sch?.leave ?? null, pickup: sch?.pickup ?? null });
    });
  });
  return out.sort((a, b) => (a.trip.time || "99:99").localeCompare(b.trip.time || "99:99"));
}

/** Where they are picked up and where they are going, each one a tap away
 *  from being navigated to. Reading a screen is not the job at 05:00; driving
 *  there is. */
function Route({ trip }: { trip: SavedTrip }) {
  const { from, to } = customerStops(trip.stops);
  const step = (stop: typeof from) => {
    const name = shortName(String(stop?.name ?? "")) || "—";
    const href = wazeLink(stop);
    return href
      ? <a className="go" href={href} target="_blank" rel="noopener"
           title={`Navigate to ${stop?.name} in Waze`}>{name}</a>
      : <span>{name}</span>;
  };
  return <span className="dash-route">{step(from)} <i>→</i> {step(to)}</span>;
}

/** Pick the language and act, in one press. */
function LangPick({
  value, onPick, label,
}: { value: Lang; onPick: (l: Lang) => void; label: string }) {
  const [lang, setLang] = useState<Lang>(value ?? "pt");
  return (
    <>
      <span className="dash-langs">
        {(["pt", "en", "fr"] as const).map((c) => (
          <button key={c} type="button" aria-pressed={lang === c}
                  title={`Write in ${{ pt: "Portuguese", en: "English", fr: "French" }[c]}`}
                  onClick={() => setLang(c)}>{c.toUpperCase()}</button>
        ))}
      </span>
      <button type="button" className="dash-btn" onClick={() => onPick(lang)}>{label}</button>
    </>
  );
}

function Block({
  title, subtitle, runs, kind, settings, onRemind, onOpen,
}: {
  title: string; subtitle: string; runs: Run[];
  kind: "before" | "onway";
  settings: Settings;
  onRemind: (r: Run, kind: "before" | "onway", lang: Lang) => void;
  onOpen: (id: number) => void;
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
                  <Route trip={r.trip} />
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
                  <LangPick value={r.quote.lang} label={kind === "before"
                              ? (sent ? "Reminded" : "Remind")
                              : (sent ? "Told them" : "On my way")}
                            onPick={(l) => onRemind(r, kind, l)} />
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
  quotes, settings, learned, onRemind, onNudge, onPaid, onOpen,
}: {
  quotes: Quote[]; settings: Settings; learned: Record<string, number>;
  onRemind: (r: Run, kind: "before" | "onway", lang: Lang) => void;
  onNudge: (r: Run, lang: Lang) => void;
  onPaid: (r: Run) => void;
  onOpen: (id: number) => void;
}) {
  const today = runsOn(quotes, isoDay(0), settings, learned);
  const tomorrow = runsOn(quotes, isoDay(1), settings, learned);
  const owed = owedRuns(quotes, settings, learned);
  const total = owed.reduce((n, r) => n + (Number(r.trip.price) || 0), 0);

  return (
    <div className="dash">
      {owed.length > 0 && (
        <section className="dash-block owed">
          <div className="dash-head">
            <h2>Owed</h2>
            <span className="dash-count">
              {`$${fmt(total, 0)} · ${owed.length} trip${owed.length === 1 ? "" : "s"} driven, not paid`}
            </span>
          </div>
          <ul className="dash-list">
            {owed.map((r) => {
              const key = `${r.quote.id}:${r.legIndex}`;
              return (
                <li key={key} className="dash-run">
                  <div className="dash-when">
                    <b>${fmt(r.trip.price ?? 0, 0)}</b>
                    <span>{daysAgo(r.trip.date)}</span>
                  </div>
                  <div className="dash-who">
                    <button type="button" className="dash-name" onClick={() => onOpen(r.quote.id)}>
                      {r.quote.customer || "(no name)"}
                    </button>
                    <Route trip={r.trip} />
                    <span className="dash-meta">
                      {[shortDay(r.trip.date), r.quote.quoteNo ? `#${r.quote.quoteNo}` : "",
                        r.quote.contact ? waPretty(r.quote.contact, settings) : ""]
                        .filter(Boolean).join("  ·  ")}
                    </span>
                  </div>
                  <div className="dash-acts">
                    <LangPick value={r.quote.lang} onPick={(l) => onNudge(r, l)} label="Ask" />
                    <button type="button" className="dash-btn paid" onClick={() => onPaid(r)}>
                      Mark paid
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Block title="Today" subtitle="tell them you've left"
             runs={today} kind="onway" settings={settings}
             onRemind={onRemind} onOpen={onOpen} />
      <Block title="Tomorrow" subtitle="remind them"
             runs={tomorrow} kind="before" settings={settings}
             onRemind={onRemind} onOpen={onOpen} />
    </div>
  );
}
