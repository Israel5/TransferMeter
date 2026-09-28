import { fmt, dur, niceDate, countList, customerRoute, shortName, tripTotals } from "./quote";
import { wordsFor } from "./words";
import { PAX_KEYS, GEAR_KEYS, BAG_KEYS, SLOT_IDS } from "./types";
import type { AppState } from "./state";
import type { Counts, Lang, Quote, Settings, Slots } from "./types";

/** Which side each child seat is strapped into, in the driver's own words.
 *
 *  This is the whole reason the customer is shown a picture of the car: a
 *  count says to bring two seats, and only this says which door to open. Left
 *  and right are the customer's, which is also the driver's -- both are
 *  facing forward. Silence means they had no preference, and silence is what
 *  it prints, because a line saying "no preference" is a line to read at 5am
 *  for nothing. */
export function seatPlaces(slots: Slots | undefined, gear: Counts, lang: Lang): string {
  const W = wordsFor(lang);
  const said = SLOT_IDS
    .map((id) => {
      const d = slots?.[id];
      // A placement the counts no longer pay for is not a placement; the
      // database drops these too, but a stale local draft may still hold one.
      if (!d || !(gear?.[d] > 0)) return null;
      const name = W[d];
      return `${W[id]}: ${Array.isArray(name) ? name[0] : name}`;
    })
    .filter(Boolean);
  return said.join(" · ");
}

/** The quote as a message, for the box the driver reads and copies. */
export function draftMessage(st: AppState): string {
  const W = wordsFor(st.lang);
  const parts: string[] = [];
  parts.push("Transfer" + (st.customer.trim() ? ` — ${st.customer.trim()}` : ""));
  if (st.quoteNo.trim()) parts.push(`${W.no} ${st.quoteNo.trim()}`);
  parts.push("");

  st.trips.forEach((t) => {
    const x = tripTotals(t, st.settings, st.learned);
    const named = t.stops.filter((s) => !s.base && String(s.name || "").trim()).map((s) => shortName(s.name));
    parts.push((t.label === "Return" ? W.ret : W.out)
      + (t.date ? ` · ${niceDate(t.date, st.lang)}` : "")
      + (t.time ? ` · ${W.at} ${t.time}` : ""));
    parts.push(`${named[0] ?? "—"} → ${named[named.length - 1] ?? "—"}`);
    parts.push(`${fmt(x.loaded, 0)} km · ${dur(x.loadedMins)} · $${fmt(x.price, 0)} CAD`);
    parts.push("");
  });

  const p = countList(st.pax, PAX_KEYS, W as any);
  const g = countList(st.gear, GEAR_KEYS, W as any);
  const b = countList(st.bags, BAG_KEYS, W as any);
  if (p) parts.push(`${W.pax}: ${p}`);
  if (g) parts.push(`${W.gear}: ${g}`);
  const where = seatPlaces(st.slots, st.gear, st.lang);
  if (where) parts.push(`${W.seatSide}: ${where}`);
  if (b) parts.push(`${W.bags}: ${b}`);
  if (p || g || b) parts.push("");

  const total = st.trips.reduce((n, t) => n + tripTotals(t, st.settings, st.learned).price, 0);
  parts.push(`${W.total}: $${fmt(total, 0)} CAD`);
  parts.push("");
  parts.push(W.note);
  return parts.join("\n");
}

/** What a customer link carries. Never the home address, cost, tip or notes. */
/** What a customer is shown: the whole route with the driver's own stops named
 *  by role, their totals, and nothing else. Stored beside the quote so this is
 *  the only definition of it. */
export function customerPayload(q: Quote, s: Settings, waDigits: (v: string) => string) {
  const W = wordsFor(q.lang);
  return {
    b: (s.bizName ?? "").trim(),
    p: (s.bizPhone ?? "").trim(),
    w: waDigits(s.bizWhats) || waDigits(s.bizPhone) || "",
    n: q.quoteNo ?? "", c: q.customer ?? "", l: q.lang,
    // The date the quote was made, which its document is dated with. Without
    // it a PDF downloaded next month claims to have been written next month.
    savedAt: q.savedAt ?? "",
    t: (q.trips ?? []).map((t) => {
      // The full journey, with my own address shown as its role rather than
      // its street, so the distance behind the price is visible.
      const v = customerRoute(t.stops, t.legKm, W);
      return {
        k: t.label === "Return" ? "ret" : "out",
        d: t.date || "", h: t.time || "",
        s: v.stops,
        // Which stops are addresses rather than the driver's base, so the
        // page knows which it may link to a map.
        r: v.real,
        m: v.legKm,
        km: Math.round(v.km * 10) / 10, mn: Math.round(t.mins ?? 0), pr: t.price ?? 0,
        // What they are actually in the car for. Without this the sheet shows
        // the whole loop and a customer reads their own journey as two hours.
        pkm: Math.round((t.paxKm ?? 0) * 10) / 10, pmn: Math.round(t.paxMins ?? 0),
      };
    }),
    // The counts as numbers, once. The customer's page words them itself, so a
    // correction there cannot leave a stale sentence behind.
    xc: { pax: { ...(q.pax ?? {}) }, gear: { ...(q.gear ?? {}) }, bags: { ...(q.bags ?? {}) },
          slots: { ...(q.slots ?? {}) } },
    seats: s.seats ?? 7,
    tot: (q.trips ?? []).reduce((n, t) => n + (t.price ?? 0), 0),
  };
}
