import { fmt, dur, niceDate, countList, customerRoute, shortName, tripTotals } from "./quote";
import { wordsFor } from "./words";
import { PAX_KEYS, GEAR_KEYS, BAG_KEYS } from "./types";
import type { AppState } from "./state";
import type { Quote, Settings } from "./types";

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
    t: (q.trips ?? []).map((t) => {
      // The full journey, with my own address shown as its role rather than
      // its street, so the distance behind the price is visible.
      const v = customerRoute(t.stops, t.legKm, W);
      return {
        k: t.label === "Return" ? "ret" : "out",
        d: t.date || "", h: t.time || "",
        s: v.stops,
        m: v.legKm,
        km: Math.round(v.km * 10) / 10, mn: Math.round(t.mins ?? 0), pr: t.price ?? 0,
        // What they are actually in the car for. Without this the sheet shows
        // the whole loop and a customer reads their own journey as two hours.
        pkm: Math.round((t.paxKm ?? 0) * 10) / 10, pmn: Math.round(t.paxMins ?? 0),
      };
    }),
    // The counts as numbers, once. The customer's page words them itself, so a
    // correction there cannot leave a stale sentence behind.
    xc: { pax: { ...(q.pax ?? {}) }, gear: { ...(q.gear ?? {}) }, bags: { ...(q.bags ?? {}) } },
    seats: s.seats ?? 7,
    tot: (q.trips ?? []).reduce((n, t) => n + (t.price ?? 0), 0),
  };
}
