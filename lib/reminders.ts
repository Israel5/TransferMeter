import { niceDate, shortName } from "./quote";
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

const WORDS = {
  pt: {
    hi: "Olá", remind: "Lembrete do seu transfer",
    tomorrow: "amanhã", today: "hoje",
    at: "às", from: "Recolha em", to: "Destino",
    onway: "Estou a caminho", arriving: "Chego por volta das",
    details: "Detalhes do seu transfer",
    who: "Passageiros", anything: "Qualquer coisa, é só responder aqui.",
  },
  en: {
    hi: "Hello", remind: "A reminder about your transfer",
    tomorrow: "tomorrow", today: "today",
    at: "at", from: "Pick-up", to: "Going to",
    onway: "I'm on my way", arriving: "I should be there around",
    details: "Your transfer details",
    who: "Passengers", anything: "Anything at all, just reply here.",
  },
  fr: {
    hi: "Bonjour", remind: "Rappel de votre transfert",
    tomorrow: "demain", today: "aujourd'hui",
    at: "à", from: "Prise en charge", to: "Destination",
    onway: "Je suis en route", arriving: "J'arrive vers",
    details: "Détails de votre transfert",
    who: "Passagers", anything: "La moindre question, répondez ici.",
  },
};

/** The stops as the customer knows them: their own, never the driver's base. */
export function customerEnds(trip: SavedTrip) {
  const named = (trip.stops ?? [])
    .filter((s) => !s.base && String(s.name || "").trim())
    .map((s) => shortName(s.name));
  return { from: named[0] ?? "—", to: named[named.length - 1] ?? "—" };
}

/** The quote's own language is the default, but not the rule: a customer may
 *  have asked in one language and be easier to reach in another, and the driver
 *  is the one who knows which. */
export function reminderMessage(
  kind: ReminderKind,
  q: Quote,
  trip: SavedTrip,
  link: string,
  s: Settings,
  lang: Lang = q.lang,
): string {
  const W = WORDS[lang] ?? WORDS.pt;
  const { from, to } = customerEnds(trip);
  const name = (q.customer || "").trim().split(/\s+/)[0] || "";
  const when = kind === "before" ? W.tomorrow : W.today;
  const lines: string[] = [];

  lines.push(`${W.hi}${name ? ` ${name}` : ""}!`);
  lines.push("");

  if (kind === "before") {
    lines.push(`${W.remind} ${when}${trip.date ? `, ${niceDate(trip.date, lang)}` : ""}${
      trip.time ? ` ${W.at} ${trip.time}` : ""}.`);
  } else {
    lines.push(`${W.onway}.${trip.time ? ` ${W.arriving} ${trip.time}.` : ""}`);
  }

  lines.push("");
  lines.push(`${W.from}: ${from}`);
  lines.push(`${W.to}: ${to}`);

  const heads = (Number(q.pax?.adults) || 0) + (Number(q.pax?.children) || 0)
    + (Number(q.pax?.infants) || 0);
  if (kind === "before" && heads > 0) lines.push(`${W.who}: ${heads}`);

  if (link) {
    lines.push("");
    lines.push(`${W.details}: ${link}`);
  }

  if (kind === "before") {
    lines.push("");
    lines.push(W.anything);
  }

  const sig = (s.bizName ?? "").trim();
  if (sig) { lines.push(""); lines.push(`— ${sig}`); }

  return lines.join("\n");
}
