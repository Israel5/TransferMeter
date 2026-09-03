import { shortName } from "./quote";
import { buildMessage } from "./templates";
import type { Lang, Quote, SavedTrip, Settings } from "./types";

/* The two messages a trip needs after it is booked.
 *
 * The day before: a reminder, with the details and the link, so nobody arrives
 * at a door that isn't expecting them. On the day: that you have left, which is
 * the message people actually watch for.
 *
 * Neither mentions the driver's own address. The stops named here are the
 * customer's own, exactly as their copy of the quote shows them.
 */

export type ReminderKind = "before" | "onway";



/** The stops as the customer knows them: their own, never the driver's base. */
export function customerEnds(trip: SavedTrip) {
  const named = (trip.stops ?? [])
    .filter((s) => !s.base && String(s.name || "").trim())
    .map((s) => shortName(s.name));
  return { from: named[0] ?? "—", to: named[named.length - 1] ?? "—" };
}

/** The quote's own language is the default, but not the rule: a customer may
 *  have asked in one language and be easier to reach in another, and the driver
 *  is the one who knows which.
 *
 *  The wording itself lives in templates.ts, where it can be rewritten. */
export function reminderMessage(
  kind: ReminderKind,
  q: Quote,
  trip: SavedTrip,
  link: string,
  s: Settings,
  lang: Lang = q.lang,
): string {
  return buildMessage(kind === "before" ? "reminder" : "onway", q, trip, link, s, lang,
                      { when: kind === "before" ? "tomorrow" : "today" });
}
