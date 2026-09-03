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
  /** Which generation of the shared settings this tab loaded. Sent back on a
   *  save so an older tab cannot write over a newer one. */
  settingsVersion?: number;
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
/** A leg's own name, minted once and kept for as long as the leg exists. */
export const newLegId = () =>
  "l" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

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
        legId: t.legId ?? newLegId(),
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
    // must not erase them, and they must not move to another leg.
    //
    // Matched by the leg's own id. It used to be matched by position, so
    // deleting the outbound half of a round trip handed its payment and its
    // fuel reading to the return -- silently, and about money.
    //
    // A quote saved before legs had ids has none to match on, and the fresh
    // ids minted above would match nothing at all -- which would lose the very
    // payments this is here to keep. Those fall back to position, which is how
    // they were saved; from the next save onwards they have ids.
    const stored = editing.trips ?? [];
    const storedHasIds = stored.some((t) => t.legId);
    const byId = new Map(stored.filter((t) => t.legId).map((t) => [t.legId as string, t]));
    content.trips.forEach((t, n) => {
      const p = storedHasIds ? (t.legId ? byId.get(t.legId) : undefined) : stored[n];
      if (!p) return;
      if (p.tip) t.tip = p.tip;
      if (p.paid) t.paid = true;
      if (p.actual) t.actual = { ...p.actual };
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
      legId: t.legId,
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

/** What the editor is holding, reduced to the things a driver would call a
 *  change. Not the computed totals: those wobble in the last decimal place
 *  between one render and the next and would report a change that is not one. */
const shapeOf = (st: AppState) => JSON.stringify({
  customer: st.customer.trim(), contact: st.contact.trim(), notes: st.notes.trim(),
  lang: st.lang, pax: st.pax, gear: st.gear, bags: st.bags,
  trips: st.trips.map((t) => ({
    label: t.label, date: t.date, time: t.time,
    price: t.priceOverride,
    stops: t.stops.map((x) => `${x.base ? "@base" : String(x.name ?? "").trim()}`),
  })),
});

const savedShapeOf = (q: Quote) => JSON.stringify({
  customer: (q.customer ?? "").trim(), contact: (q.contact ?? "").trim(),
  notes: (q.notes ?? "").trim(), lang: q.lang, pax: q.pax, gear: q.gear, bags: q.bags,
  trips: (q.trips ?? []).map((t) => ({
    label: t.label, date: t.date, time: t.time,
    price: t.price,
    stops: (t.stops ?? []).map((x) => `${x.base ? "@base" : String(x.name ?? "").trim()}`),
  })),
});

/** Whether the quote on screen differs from the one in the database.
 *
 *  The sync indicator answers a different question -- whether the draft
 *  reached the server -- and reading it as "saved" is how a price typed into
 *  the editor can sit there looking finished while the trips list still shows
 *  the old one. */
export function hasUnsavedChanges(st: AppState): boolean {
  if (st.editingId == null) {
    // Nothing opened: unsaved only once there is something worth saving.
    return st.trips.some((t) => t.stops.some((s) => !s.base && String(s.name || "").trim()));
  }
  const saved = st.quotes.find((q) => q.id === st.editingId);
  if (!saved) return true;
  return shapeOf(st) !== savedShapeOf(saved);
}

/** Whether saving would change what a customer already holds a link to.
 *
 *  Their link shows the quote as it stands, which is what you asked for -- so a
 *  price or a date changing on a quote they have already been sent is
 *  something they will see. Names and notes are not: they are not on the page.
 *
 *  Returns what to say, or null when there is nothing worth stopping for. */
export function affectsCustomer(st: AppState): { customer: string; when: string } | null {
  if (st.editingId == null) return null;
  const saved = st.quotes.find((q) => q.id === st.editingId);
  if (!saved) return null;
  if (!["sent", "approved", "declined"].includes(saved.status ?? "draft")) return null;

  const before = (saved.trips ?? []).map((t) => `${t.price}|${t.date}|${t.time}`).join(";");
  const after = st.trips.map((t) => `${t.priceOverride}|${t.date}|${t.time}`).join(";");
  if (before === after) return null;

  return {
    customer: (saved.customer || "your customer").trim(),
    when: saved.status === "approved" ? "approved" : saved.status === "declined" ? "declined" : "was sent",
  };
}

export const owedOn = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (t.paid ? 0 : Number(t.price) || 0), 0);

export const tipTotal = (q: Quote) =>
  (q.trips ?? []).reduce((n, t) => n + (Number(t.tip) || 0), 0);
