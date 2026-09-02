import { DEFAULTS, emptyPax, emptyGear, emptyBags } from "./types";
import type { Counts, Lang, Quote, SavedTrip, Settings, Stop, Trip } from "./types";
import { tripTotals, grandTotals } from "./quote";

export type AppState = {
  settings: Settings;
  learned: Record<string, number>;
  trips: Trip[];
  active: number;
  pax: Counts; gear: Counts; bags: Counts;
  customer: string; contact: string; notes: string;
  quoteNo: string;
  editingId: string | null;
  quotes: Quote[];
  lang: Lang;
};

export const homeStop = (s: Settings): Stop => ({ name: s.homeName, base: true });

export function defaultRoute(s: Settings, dir: "to" | "from" = "to"): Stop[] {
  const yul = { name: "YUL — Montréal-Trudeau Airport" };
  return dir === "from"
    ? [homeStop(s), yul, { name: "" }, homeStop(s)]
    : [homeStop(s), { name: "" }, yul, homeStop(s)];
}

export function newTrip(s: Settings, label: Trip["label"] = "Outbound", dir: "to" | "from" = "to"): Trip {
  return { label, date: "", time: "", stops: defaultRoute(s, dir), liveLegs: null, priceOverride: null };
}

/** The return leg starts as a mirror of the outbound, then is edited freely. */
export function mirrorOf(trip: Trip, s: Settings): Trip {
  const mid = trip.stops.slice(1, -1).reverse().map((st) => ({ ...st }));
  return { label: "Return", date: "", time: "", stops: [homeStop(s), ...mid, homeStop(s)],
           liveLegs: null, priceOverride: null };
}

export function initialState(): AppState {
  const settings = { ...DEFAULTS };
  return {
    settings, learned: {},
    trips: [newTrip(settings)], active: 0,
    pax: emptyPax(), gear: emptyGear(), bags: emptyBags(),
    customer: "", contact: "", notes: "", quoteNo: "",
    editingId: null, quotes: [], lang: "pt",
  };
}

/** One past the highest number actually saved this year, so nothing drifts. */
export function nextQuoteNo(quotes: Quote[]) {
  const year = new Date().getFullYear();
  let highest = 0;
  quotes.forEach((q) => {
    const m = String(q?.quoteNo ?? "").match(/^(\d{4})-0*(\d+)$/);
    if (m && Number(m[1]) === year) highest = Math.max(highest, Number(m[2]));
  });
  return `${year}-${String(highest + 1).padStart(3, "0")}`;
}

export function makeId() {
  return "q" + Date.now().toString(36) + Math.floor((performance.now() * 1000) % 1000).toString(36);
}

export function snapshot(st: AppState, id?: string): Quote {
  const g = grandTotals(st.trips, st.settings, st.learned);
  return {
    id: id ?? makeId(),
    savedAt: new Date().toISOString(),
    customer: st.customer.trim(),
    contact: st.contact.trim(),
    notes: st.notes.trim(),
    quoteNo: st.quoteNo.trim(),
    status: "draft",
    origin: "driver",
    lang: st.lang,
    trips: st.trips.map((t): SavedTrip => {
      const x = tripTotals(t, st.settings, st.learned);
      return {
        label: t.label, date: t.date, time: t.time || "",
        stops: t.stops.map((s) => ({ name: s.name, base: !!s.base, placeId: s.placeId, lat: s.lat, lng: s.lng })),
        legKm: x.legs.map((l) => l.km),
        totalKm: x.total, mins: x.mins, cost: x.cost, price: x.price,
        paxKm: x.loaded, paxMins: x.loadedMins,
        tip: 0, paid: false, override: t.priceOverride,
        actual: t.actual,
      };
    }),
    pax: { ...st.pax }, gear: { ...st.gear }, bags: { ...st.bags },
    totalKm: g.total, cost: g.cost, price: g.price, mins: g.mins, keep: g.price - g.cost,
  };
}

export type SaveResult =
  | { ok: false; reason: "empty" | "clash"; message: string }
  | { ok: true; state: AppState; created: boolean; quote: Quote };

/** Identity is the id of the quote you opened, never the editable number. */
export function saveQuote(st: AppState): SaveResult {
  const named = st.trips.some((t) => t.stops.some((s) => !s.base && String(s.name || "").trim()));
  if (!named) {
    return { ok: false, reason: "empty", message: "Nothing to save yet — add where you're picking the customer up." };
  }

  const quoteNo = st.quoteNo.trim() || nextQuoteNo(st.quotes);
  let i = st.editingId ? st.quotes.findIndex((q) => q.id === st.editingId) : -1;
  if (i < 0 && quoteNo) i = st.quotes.findIndex((q) => q.quoteNo === quoteNo);

  const clash = st.quotes.find((q, n) => n !== i && q.quoteNo === quoteNo);
  if (clash) {
    return { ok: false, reason: "clash",
      message: `Number ${quoteNo} already belongs to ${clash.customer || "another trip"}.` };
  }

  const withNo = { ...st, quoteNo };
  const quotes = st.quotes.slice();
  let created: boolean;
  let snap: Quote;

  if (i >= 0) {
    const prev = quotes[i];
    snap = snapshot(withNo, prev.id);           // editing must not change identity
    snap.status = prev.status || "draft";
    snap.savedAt = prev.savedAt;
    snap.origin = prev.origin ?? "driver";
    // Tips, payments and fuel readings record what happened; a revised price
    // must not erase them.
    snap.trips.forEach((t, n) => {
      const p = prev.trips?.[n];
      if (p?.tip) t.tip = p.tip;
      if (p?.paid) t.paid = true;
      if (p?.actual) t.actual = { ...p.actual };
    });
    quotes[i] = snap;
    created = false;
  } else {
    snap = snapshot(withNo);
    quotes.unshift(snap);
    created = true;
  }

  return { ok: true, created, quote: snap,
    // Keeping the newest N on screen; nothing is deleted by this, the rest are
    // still in the database. At a few transfers a week this is decades away.
    state: { ...withNo, quotes: quotes.slice(0, 2000), editingId: snap.id } };
}

export function loadQuote(st: AppState, id: string): AppState {
  const q = st.quotes.find((x) => x.id === id);
  if (!q) return st;
  return {
    ...st,
    trips: q.trips.map((t) => ({
      label: t.label, date: t.date || "", time: t.time || "",
      stops: t.stops.map((s) => ({ ...s })),
      liveLegs: t.legKm ? t.legKm.map((km) => ({ km: Number(km) || 0, mins: NaN })) : null,
      priceOverride: t.price,          // pin the fare that was quoted
      actual: t.actual,                // and the readings taken since
    })),
    active: 0,
    customer: q.customer || "", contact: q.contact || "", notes: q.notes || "",
    quoteNo: q.quoteNo || "", editingId: q.id,
    pax: { ...emptyPax(), ...q.pax }, gear: { ...emptyGear(), ...q.gear }, bags: { ...emptyBags(), ...q.bags },
    lang: q.lang || st.lang,
  };
}

export function newQuote(st: AppState): AppState {
  return {
    ...st,
    trips: [newTrip(st.settings)], active: 0,
    customer: "", contact: "", notes: "", quoteNo: "", editingId: null,
    pax: emptyPax(), gear: emptyGear(), bags: emptyBags(),
  };
}

/** One quote number is one job; older copies of it are dropped. */
export function dedupeQuotes(list: Quote[]) {
  const seen = new Set<string>(), out: Quote[] = [];
  for (const q of list ?? []) {
    if (!q) continue;
    const byId = "id:" + q.id;
    const byNo = q.quoteNo ? `no:${q.quoteNo}|${q.customer ?? ""}` : null;
    if (seen.has(byId) || (byNo && seen.has(byNo))) continue;
    seen.add(byId); if (byNo) seen.add(byNo);
    out.push(q);
  }
  return out;
}

export const owedOn = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (t.paid ? 0 : Number(t.price) || 0), 0);

export const tipTotal = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (Number(t.tip) || 0), 0);
