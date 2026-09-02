import { PLACE_BY_NAME } from "./places";
import type { Actual, Counts, Quote, SavedTrip, Settings, Stop, Trip, Lang } from "./types";

/* ---------- geography ---------- */

export function haversine(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseCoords(text: string) {
  const m = String(text).match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function resolveStop(stop: Stop, s: Settings) {
  if (stop.base) return { lat: s.homeLat, lng: s.homeLng };
  const hit = PLACE_BY_NAME.get(String(stop.name || "").trim().toLowerCase());
  if (hit) return { lat: hit.lat, lng: hit.lng };
  if (Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
    return { lat: stop.lat as number, lng: stop.lng as number };
  }
  return parseCoords(stop.name);
}

/** Symmetric, so a correction learned one way is used the other way too. */
export function legKey(a: Stop, b: Stop) {
  const x = a.base ? "@home" : String(a.name || "").trim().toLowerCase();
  const y = b.base ? "@home" : String(b.name || "").trim().toLowerCase();
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

/* ---------- distances ---------- */

export type LegInfo = {
  km: number | null;
  mins?: number;
  source: "saved" | "google" | "est" | "none";
  key: string;
  known: boolean;
};

/** Precedence: a distance you typed, then Google, then a straight-line estimate. */
export function legInfo(trip: Trip, i: number, s: Settings, learned: Record<string, number>): LegInfo {
  const a = trip.stops[i], b = trip.stops[i + 1];
  const key = legKey(a, b);
  if (Object.prototype.hasOwnProperty.call(learned, key)) {
    return { km: learned[key], source: "saved", key, known: true };
  }
  const live = trip.liveLegs?.[i];
  if (live && Number.isFinite(live.km)) {
    return { km: live.km, mins: live.mins, source: "google", key, known: true };
  }
  const pa = resolveStop(a, s), pb = resolveStop(b, s);
  if (pa && pb) return { km: haversine(pa, pb) * s.roadFactor, source: "est", key, known: true };
  return { km: null, source: "none", key, known: false };
}

export function legMins(info: LegInfo, s: Settings) {
  if (info.km == null) return 0;
  if (Number.isFinite(info.mins)) return info.mins as number;
  return s.avgSpeed > 0 ? (info.km / s.avgSpeed) * 60 : 0;
}

export function bandPrice(km: number, s: Settings) {
  if (km <= s.t1max) return { price: s.t1, note: `up to ${s.t1max} km` };
  if (km <= s.t2max) return { price: s.t2, note: `${s.t1max}–${s.t2max} km` };
  return { price: s.t3, note: `over ${s.t2max} km` };
}

export type Totals = ReturnType<typeof tripTotals>;

export function tripTotals(trip: Trip, s: Settings, learned: Record<string, number>) {
  const legs: LegInfo[] = [];
  let total = 0, missing = 0;
  for (let i = 0; i < trip.stops.length - 1; i++) {
    const info = legInfo(trip, i, s, learned);
    legs.push(info);
    if (info.km == null) missing++; else total += info.km;
  }

  // What the customer is actually in the car for; the rest is my own running around.
  let first = -1, last = -1;
  trip.stops.forEach((st, i) => {
    if (!st.base && String(st.name || "").trim()) { if (first < 0) first = i; last = i; }
  });
  let loaded = 0, loadedMins = 0;
  if (first >= 0 && last > first) {
    for (let i = first; i < last; i++) {
      if (legs[i]?.km != null) { loaded += legs[i].km as number; loadedMins += legMins(legs[i], s); }
    }
    loadedMins += s.waitPerStop * Math.max(0, last - first - 1);
  }

  const fuelL = s.kmPerL > 0 ? total / s.kmPerL : 0;
  const cost = fuelL * s.fuelPrice;
  const driveMins = legs.length && legs.every((l) => Number.isFinite(l.mins))
    ? legs.reduce((n, l) => n + (l.mins as number), 0)
    : s.avgSpeed > 0 ? (total / s.avgSpeed) * 60 : 0;
  const mins = driveMins + s.waitPerStop * Math.max(0, trip.stops.length - 2);

  const band = bandPrice(total, s);
  const price = trip.priceOverride != null ? trip.priceOverride : band.price;

  return {
    legs, total, loaded, loadedMins, empty: Math.max(0, total - loaded),
    fuelL, cost, mins, missing, band, price, keep: price - cost,
  };
}

export function grandTotals(trips: Trip[], s: Settings, learned: Record<string, number>) {
  return trips.reduce(
    (acc, t) => {
      const x = tripTotals(t, s, learned);
      acc.total += x.total; acc.cost += x.cost; acc.price += x.price;
      acc.mins += x.mins; acc.missing += x.missing;
      return acc;
    },
    { total: 0, cost: 0, price: 0, mins: 0, missing: 0 },
  );
}


/** The whole route as a customer should read it: every stop and every leg, but
 *  the driver's own address replaced by what it is rather than where it is.
 *  They see the full distance behind the price without learning where I live. */
export function customerRoute(
  stops: Stop[],
  legKm: (number | null)[],
  labels: { startPoint: string; endPoint: string },
) {
  const named = stops.map((st, i) => {
    if (!st.base) return String(st.name || "—");
    return i === 0 ? labels.startPoint : i === stops.length - 1 ? labels.endPoint : labels.startPoint;
  });
  const km = legKm.map((n) => Math.round((Number(n) || 0) * 10) / 10);
  return { stops: named, legKm: km, km: km.reduce((a, b) => a + b, 0) };
}

/* ---------- schedule ---------- */

export function scheduleFor(trip: Trip, s: Settings, learned: Record<string, number>) {
  if (!trip.date || !trip.time) return null;
  const pickup = new Date(`${trip.date}T${trip.time}`);
  if (Number.isNaN(pickup.getTime())) return null;

  const t = tripTotals(trip, s, learned);
  const pi = trip.stops.findIndex((st) => !st.base && String(st.name || "").trim());
  if (pi < 1 || t.missing > 0) return null;

  let toPickup = 0;
  for (let i = 0; i < pi; i++) toPickup += legMins(t.legs[i], s);
  const leave = new Date(pickup.getTime() - (toPickup + s.leaveBuffer) * 60000);

  let li = -1;
  trip.stops.forEach((st, i) => { if (!st.base && String(st.name || "").trim()) li = i; });
  let after = s.waitPerStop;
  for (let i = pi; i < li; i++) {
    after += legMins(t.legs[i], s);
    if (i > pi) after += s.waitPerStop;
  }
  return {
    leave, pickup,
    arrive: li > pi ? new Date(pickup.getTime() + after * 60000) : null,
    driveToPickup: toPickup,
    dest: li > pi ? shortName(trip.stops[li].name) : null,
  };
}

/* ---------- what it really cost ---------- */

/** The dash reads litres per 100 km, the settings read km per litre. Same
 *  claim, inverted: 5 km/L is 20 L/100 km. Shown both ways so neither the car
 *  nor the settings page has to be converted in your head. */
export const toL100 = (kmPerL: number) => (kmPerL > 0 ? 100 / kmPerL : 0);
export const toKmPerL = (l100: number) => (l100 > 0 ? 100 / l100 : 0);

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export type FuelUsed = {
  km: number; l100: number; price: number; litres: number; cost: number;
  measured: { km: boolean; l100: boolean; price: boolean };
};

/** The fuel a ride actually burned, falling back field by field to what was
 *  assumed for the quote. Returns null when nothing at all was measured, so a
 *  caller can tell a reading from an estimate instead of inferring it from the
 *  numbers — an actual cost that lands on the estimate is still a measurement. */
export function fuelUsed(a: Actual | undefined, estKm: number, s: Settings): FuelUsed | null {
  if (!a || (!has(a.km) && !has(a.l100) && !has(a.price))) return null;
  const km = has(a.km) ? a.km : estKm;
  const l100 = has(a.l100) ? a.l100 : toL100(s.kmPerL);
  const price = has(a.price) ? a.price : s.fuelPrice;
  const litres = (km * l100) / 100;
  return {
    km, l100, price, litres, cost: litres * price,
    measured: { km: has(a.km), l100: has(a.l100), price: has(a.price) },
  };
}

/** What a saved leg cost: the estimate, the measurement if there is one, and
 *  the figure to actually report. */
export function legCost(t: SavedTrip, s: Settings) {
  const est = Number(t.cost) || 0;
  const real = fuelUsed(t.actual, Number(t.totalKm) || 0, s);
  return { est, cost: real ? real.cost : est, real };
}

/** Your real consumption across every ride where you read the dash, weighted
 *  by distance so a long trip counts for more than a short one. This is the
 *  number the settings default is guessing at. */
export function measuredAverage(quotes: Quote[]) {
  let km = 0, litres = 0, n = 0;
  (quotes ?? []).forEach((q) => (q.trips ?? []).forEach((t) => {
    const l100 = Number(t.actual?.l100);
    if (!has(l100)) return;
    const d = has(Number(t.actual?.km)) ? Number(t.actual?.km) : Number(t.totalKm) || 0;
    if (d <= 0) return;
    km += d; litres += (d * l100) / 100; n++;
  }));
  return km > 0 && litres > 0 ? { n, km, litres, l100: (litres / km) * 100, kmPerL: km / litres } : null;
}


/* ---------- formatting ---------- */

export const fmt = (n: number, d: number) =>
  Number(n).toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
export const money = (n: number) => `$${fmt(n, 2)}`;

export function dur(mins: number) {
  const m = Math.round(mins || 0), h = Math.floor(m / 60), r = m % 60;
  return h > 0 ? `${h} h ${String(r).padStart(2, "0")}` : `${m} min`;
}

/** Day-first for PT and FR, ISO for EN. */
export function niceDate(iso: string, lang: Lang = "pt") {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return lang === "en" ? iso : `${d}/${m}/${y}`;
}

export function shortDay(iso: string) {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("en-CA", { day: "2-digit", month: "short" });
}

export const shortName = (n: string) =>
  String(n).split("—")[0].split("(")[0].trim() || String(n);

export function countList(store: Counts, keys: [string, string][], dict: Record<string, [string, string]>) {
  return keys
    .filter(([k]) => (store?.[k] ?? 0) > 0)
    .map(([k]) => {
      const w = dict[k];
      const n = store[k];
      return `${n} ${n === 1 ? w[0] : w[1]}`;
    })
    .join(", ");
}

/** "Débora Gonçalves" -> "debora-goncalves"; the accented letter survives. */
const SLUG_LETTERS: Record<string, string> = {
  "æ": "ae", "œ": "oe", "ø": "o", "ð": "d", "þ": "th",
  "ß": "ss", "đ": "d", "ł": "l", "ı": "i", "ħ": "h", "ŧ": "t", "ŉ": "n",
};
export function slugify(str: string, fallback = "") {
  const out = String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[æœøðþßđłıħŧŉ]/g, (ch) => SLUG_LETTERS[ch] || ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return out || fallback;
}
