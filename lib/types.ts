export type Stop = {
  name: string;
  base?: boolean;          // the driver's own address, never shown to a customer
  placeId?: string;
  lat?: number;
  lng?: number;
};

export type LegSource = "saved" | "google" | "est" | "none";

export type Trip = {
  label: "Outbound" | "Return";
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM
  stops: Stop[];
  liveLegs: { km: number; mins: number }[] | null;
  priceOverride: number | null;
  tip?: number;
  paid?: boolean;
};

export type Counts = Record<string, number>;

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

export type Settings = {
  homeName: string; homeLat: number; homeLng: number;
  bizName: string; bizPhone: string; bizWhats: string;
  customerPage: string;
  kmPerL: number; fuelPrice: number; roadFactor: number;
  avgSpeed: number; waitPerStop: number; seats: number; leaveBuffer: number;
  countryCode: string;
  t1max: number; t1: number; t2max: number; t2: number; t3: number;
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
};

export type Quote = {
  id: string;
  savedAt: string;
  quoteNo: string;
  customer: string;
  contact: string;
  notes: string;
  status: QuoteStatus;
  origin?: "driver" | "customer";
  lang: Lang;
  trips: SavedTrip[];
  pax: Counts; gear: Counts; bags: Counts;
  totalKm: number; cost: number; price: number; mins: number; keep: number;
  /** Addresses this quote for a customer. Lives on the row, not in the data. */
  shareToken?: string;
};

export type Lang = "pt" | "en" | "fr";

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
