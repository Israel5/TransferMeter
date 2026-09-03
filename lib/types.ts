export type Stop = {
  name: string;
  base?: boolean;          // the driver's own address, never shown to a customer
  placeId?: string;
  lat?: number;
  lng?: number;
};

export type LegSource = "saved" | "google" | "est" | "none";

/** What a ride actually cost, read off the car after driving it.
 *
 *  Every field is optional and independent: fill in only what you measured and
 *  the rest falls back to the estimate's own assumption. Recorded after the
 *  fact, so it moves cost and profit and never the agreed price. */
export type Actual = {
  km?: number;     // the odometer for this ride
  l100?: number;   // the trip computer's average, litres per 100 km
  price?: number;  // $/L from the fill-up that fuelled it
};

export type Trip = {
  label: "Outbound" | "Return";
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM
  stops: Stop[];
  liveLegs: { km: number; mins: number }[] | null;
  priceOverride: number | null;
  tip?: number;
  paid?: boolean;
  /** Measured after driving it; see Actual. Absent means the estimate stands. */
  actual?: Actual;
};

export type Counts = Record<string, number>;

export type Settings = {
  homeName: string; homeLat: number; homeLng: number;
  bizName: string; bizPhone: string; bizWhats: string;
  customerPage: string;
  kmPerL: number; fuelPrice: number; roadFactor: number;
  avgSpeed: number; waitPerStop: number; seats: number; leaveBuffer: number;
  countryCode: string;
  t1max: number; t1: number; t2max: number; t2: number; t3: number;
  /** Rewritten customer messages, by kind and language. Only what you have
   *  actually changed is stored; anything absent uses the built-in wording, so
   *  a better default still reaches you. */
  templates?: Partial<Record<string, Partial<Record<Lang, string>>>>;
};

export type QuoteStatus = "draft" | "requested" | "sent" | "approved" | "declined";

export type SavedTrip = {
  label: Trip["label"];
  date: string; time: string;
  stops: Stop[];
  legKm: (number | null)[];
  totalKm: number; mins: number; cost: number; price: number;
  paxKm: number; paxMins: number;
  tip: number; paid: boolean;
  override: number | null;
  /** Measured after driving it. Absent means the estimate above still stands. */
  actual?: Actual;
  /** When the day-before reminder and the on-my-way message were sent, so the
   *  dashboard is a list of what is left to do rather than what exists. */
  remindedAt?: string;
  onWayAt?: string;
};

/** What a quote says: everything the driver writes, and nothing the database
 *  decides. This is what gets sent when a quote is created or edited. */
export type QuoteContent = {
  customer: string;
  contact: string;
  notes: string;
  origin: "driver" | "customer";
  lang: Lang;
  trips: SavedTrip[];
  pax: Counts; gear: Counts; bags: Counts;
  totalKm: number; cost: number; price: number; mins: number; keep: number;
};

/** A stored quote: its content, plus the four things only the database says.
 *  None of these are written by the app, and none of them live in the content:
 *  the id issues the number, the status follows an act, and the token is the
 *  address a customer's link carries. */
export type Quote = QuoteContent & {
  id: number;
  quoteNo: string;
  savedAt: string;
  status: QuoteStatus;
  shareToken?: string;
  customerEditedAt?: string;
};

export type Lang = "pt" | "en" | "fr";

/** What a customer is shown, and the only thing their documents are built
 *  from. Deliberately not a Quote: the driver's address, cost and notes have
 *  no field here to sit in. */
export type CustomerViewLeg = {
  k: string; d: string; h: string;
  s: string[]; m: number[];
  km: number; mn: number; pr: number;
  pkm?: number; pmn?: number;
};

export type CustomerView = {
  b?: string; p?: string; w?: string; n?: string; c?: string;
  l?: Lang; savedAt?: string;
  t?: CustomerViewLeg[];
  xc?: { pax?: Counts; gear?: Counts; bags?: Counts };
  seats?: number;
  tot?: number;
};

export const DEFAULTS: Settings = {
  homeName: "", homeLat: 45.5019, homeLng: -73.5674,   // Montréal centre
  bizName: "", bizPhone: "", bizWhats: "", customerPage: "",
  kmPerL: 5, fuelPrice: 2.0, roadFactor: 1.35,
  avgSpeed: 55, waitPerStop: 10, seats: 7, leaveBuffer: 10,
  countryCode: "1",
  t1max: 45, t1: 50, t2max: 75, t2: 60, t3: 70,
};

export const PAX_KEYS: [string, string][] = [
  ["adults", "Adults"], ["children", "Children"], ["infants", "Babies"],
];
export const GEAR_KEYS: [string, string][] = [
  ["infantSeat", "Infant seat"], ["carSeat", "Car seat"], ["booster", "Booster"],
];
export const BAG_KEYS: [string, string][] = [
  ["checked", "Suitcases"], ["carry", "Carry-on"], ["backpack", "Backpacks"],
  ["stroller", "Stroller"], ["crib", "Travel crib"], ["other", "Other items"],
];

export const emptyPax = (): Counts => ({ adults: 2, children: 0, infants: 0 });
export const emptyGear = (): Counts => ({ infantSeat: 0, carSeat: 0, booster: 0 });
export const emptyBags = (): Counts => ({
  checked: 0, carry: 0, backpack: 0, stroller: 0, crib: 0, other: 0,
});
