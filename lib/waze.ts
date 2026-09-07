import type { Stop } from "./types";

/* Handing an address to the car.
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
