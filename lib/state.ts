import { DEFAULTS, emptyPax, emptyGear, emptyBags } from "./types";
import type { Counts, Lang, Quote, QuoteContent, SavedTrip, Settings, Stop, Trip } from "./types";
import { tripTotals, grandTotals } from "./quote";

export type AppState = {
  settings: Settings;
  learned: Record<string, number>;
  trips: Trip[];
  active: number;
  pax: Counts; gear: Counts; bags: Counts;
  customer: string; contact: string; notes: string;
  quoteNo: string;
  editingId: number | null;
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

/** The quote as the driver has written it. No id, no number, no status: those
 *  belong to the database, and a snapshot is only ever the content. */
export function snapshot(st: AppState): QuoteContent {
  const g = grandTotals(st.trips, st.settings, st.learned);
  return {
    customer: st.customer.trim(),
    contact: st.contact.trim(),
    notes: st.notes.trim(),
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
  | { ok: false; message: string }
  | { ok: true; state: AppState; content: QuoteContent; editing: Quote | null };

/** Work out what to save. Editing keeps the quote you opened; otherwise this
 *  is a new one and the database will give it an id and a number.
 *
 *  Deliberately returns rather than writes: only the caller can wait for the
 *  database, and a new quote has no identity until it has. */
export function saveQuote(st: AppState): SaveResult {
  const named = st.trips.some((t) => t.stops.some((s) => !s.base && String(s.name || "").trim()));
  if (!named) {
    return { ok: false, message: "Nothing to save yet — add where you're picking the customer up." };
  }

  const editing = st.editingId != null
    ? st.quotes.find((q) => q.id === st.editingId) ?? null
    : null;

  const content = snapshot(st);
  if (editing) {
    // Tips, payments and fuel readings record what happened; a revised price
    // must not erase them.
    content.trips.forEach((t, n) => {
      const p = editing.trips?.[n];
      if (p?.tip) t.tip = p.tip;
      if (p?.paid) t.paid = true;
      if (p?.actual) t.actual = { ...p.actual };
    });
  }

  return { ok: true, content, editing, state: st };
}

/** Fold a saved quote back into what is on screen. */
export function withQuote(st: AppState, q: Quote): AppState {
  const i = st.quotes.findIndex((x) => x.id === q.id);
  const quotes = st.quotes.slice();
  if (i >= 0) quotes[i] = q; else quotes.unshift(q);
  return { ...st, quotes, editingId: q.id, quoteNo: q.quoteNo };
}

export function loadQuote(st: AppState, id: number): AppState {
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

export const owedOn = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (t.paid ? 0 : Number(t.price) || 0), 0);

export const tipTotal = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (Number(t.tip) || 0), 0);
