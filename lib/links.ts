import type { Stop } from "./types";

/* Handing an address to a map.
 *
 * Two of them, for two different people. The driver wants Waze, because the
 * point is to drive there. A customer wants Google Maps, because the point is
 * to check it: they read the address on their quote and want to see where it
 * lands before they agree to be collected from it.
 *
 * Coordinates when the stop has them, because a place picked from Google is
 * already pinned and re-searching its name can land on a different one --
 * there is more than one Rue Sherbrooke. The written address only when there
 * is nothing better, which is what a hand-typed stop leaves us.
 */

export function wazeLink(stop: Stop | null | undefined): string | null {
  if (!stop) return null;

  const lat = Number(stop.lat), lng = Number(stop.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }

  const name = String(stop.name ?? "").trim();
  if (!name) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(name)}&navigate=yes`;
}

/** The stops a customer is picked up from and taken to, as stops rather than
 *  names, so they can be navigated to as well as read. */
export function customerStops(stops: Stop[] | undefined) {
  const named = (stops ?? []).filter((s) => !s.base && String(s.name || "").trim());
  return { from: named[0] ?? null, to: named[named.length - 1] ?? null };
}

/* The same address, for someone who only wants to look at it.
 *
 * Searched by its written form rather than by coordinates, because that is what
 * the customer is checking. Google shows them the address they were quoted, on
 * a map, and any mistake in it shows up as a pin in the wrong place.
 */
export function mapsLink(address: string | null | undefined): string | null {
  const q = String(address ?? "").trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* A flight number, and the board that says where the plane actually is.
 *
 * Kept as the airline's two or three character code and its digits, upper
 * case and without the space people write it with, because that is the form
 * every board wants and the form a driver recognises on a screen. Anything
 * that is not that shape gets no link rather than a broken one: a note like
 * "the 6am from Lisbon" is worth storing and is not worth sending anywhere.
 */
export function cleanFlightNo(v: string | null | undefined): string {
  return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/* The airline, then one to four digits, then the letter some carriers put on
 * a duplicated leg.
 *
 * The airline part is spelled out rather than left as "two or three of
 * anything", because an all-digit code does not exist: IATA gives out two
 * characters with at least one letter in them (AC, U2, 9W) and ICAO gives out
 * three letters (TAP). Written loosely, "12345" reads as a flight and earns a
 * link to a page that is not there. */
const FLIGHT_NO = /^(?:[A-Z]{2}|[A-Z]\d|\d[A-Z]|[A-Z]{3})\d{1,4}[A-Z]?$/;

export function isFlightNo(v: string | null | undefined): boolean {
  return FLIGHT_NO.test(cleanFlightNo(v));
}

/* Flightradar24 rather than the airline's own page, because it is the same
 * address for every carrier and it answers the only question worth asking on
 * the morning: has it left, and is it still going to land when it said.
 *
 * The flight-number page, not a single flight's id -- that id changes every
 * day, and a quote is written weeks before the plane flies. */
export function flightRadarLink(v: string | null | undefined): string | null {
  const no = cleanFlightNo(v);
  if (!FLIGHT_NO.test(no)) return null;
  return `https://www.flightradar24.com/data/flights/${no.toLowerCase()}`;
}
