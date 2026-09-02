// Google Maps Platform. Runs only on the server; the key never reaches a browser.
import type { Stop } from "./types";

const MONTREAL = { latitude: 45.5019, longitude: -73.5674 };

export function apiKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_PLACES_API_KEY ?? "";
}

export class MapsError extends Error {
  status: number;
  constructor(message: string, status = 500) { super(message); this.status = status; }
}

type Waypoint =
  | { placeId: string }
  | { location: { latLng: { latitude: number; longitude: number } } }
  | { address: string };

export function waypoint(stop: Partial<Stop> & { address?: string }): Waypoint | null {
  if (stop?.placeId) return { placeId: stop.placeId };
  if (typeof stop?.lat === "number" && typeof stop?.lng === "number") {
    return { location: { latLng: { latitude: stop.lat, longitude: stop.lng } } };
  }
  if (stop?.address) return { address: String(stop.address) };
  return null;
}

export async function autocomplete(key: string, q: string, country: string) {
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: country ? [country.toLowerCase()] : undefined,
      locationBias: { circle: { center: MONTREAL, radius: 50000.0 } },  // Google caps at 50 km
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new MapsError(d?.error?.message ?? "autocomplete failed", r.status);
  return (d.suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({ placeId: s.placePrediction.placeId, text: s.placePrediction.text?.text ?? "" }));
}

export async function placeLocation(key: string, placeId: string) {
  const r = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=location,formattedAddress`,
    { headers: { "X-Goog-Api-Key": key } },
  );
  const d = await r.json();
  if (!r.ok) throw new MapsError(d?.error?.message ?? "place lookup failed", r.status);
  return { lat: d.location?.latitude, lng: d.location?.longitude, address: d.formattedAddress ?? "" };
}

export async function route(key: string, stops: unknown[], departureTime?: string | null) {
  const pts = (stops ?? []).map((s) => waypoint(s as Stop));
  if (pts.length < 2 || pts.some((p) => !p)) {
    throw new MapsError("every stop needs an address, place or coordinates", 400);
  }
  const call = (departAt: string | null) =>
    fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.legs.distanceMeters,routes.legs.duration",
      },
      body: JSON.stringify({
        origin: pts[0],
        destination: pts[pts.length - 1],
        intermediates: pts.slice(1, -1),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        // Traffic at the pick-up hour. Google rejects a departure in the past,
        // so a stale one is dropped rather than failing the whole call.
        ...(departAt ? { departureTime: departAt } : {}),
      }),
    });

  let r = await call(departureTime ?? null);
  let d = await r.json();
  if (!r.ok && departureTime && /departure|timestamp|past/i.test(d?.error?.message ?? "")) {
    r = await call(null);
    d = await r.json();
  }
  if (!r.ok) throw new MapsError(d?.error?.message ?? "route failed", r.status);

  const rt = (d.routes ?? [])[0];
  if (!rt) throw new MapsError("Google found no driving route between those stops", 422);
  return {
    legs: (rt.legs ?? []).map((l: any) => ({
      km: (l.distanceMeters ?? 0) / 1000,
      mins: parseFloat(String(l.duration ?? "0s")) / 60,
    })),
    totalKm: (rt.distanceMeters ?? 0) / 1000,
    totalMins: parseFloat(String(rt.duration ?? "0s")) / 60,
  };
}
