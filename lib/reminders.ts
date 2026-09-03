import { shortName } from "./quote";
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
    hi: "Olá", excl: "!", colon: ":", remind: "Passando pra lembrar do seu transfer",
    tomorrow: "amanhã", today: "hoje",
    at: "às", from: "Embarque em", to: "Destino",
    onway: "Já estou a caminho", arriving: "Devo chegar por volta das",
    details: "Detalhes da sua viagem",
    who: "Passageiros", anything: "Qualquer dúvida, é só me chamar por aqui.",
  },
  en: {
    hi: "Hello", excl: "!", colon: ":", remind: "Just a reminder about your transfer",
    tomorrow: "tomorrow", today: "today",
    at: "at", from: "Pick-up", to: "Going to",
    onway: "I'm on my way", arriving: "I should be there around",
    details: "Your trip details",
    who: "Passengers", anything: "Any questions, just message me here.",
  },
  fr: {
    hi: "Bonjour", excl: " !", colon: " :", remind: "Petit rappel pour votre transfert",
    tomorrow: "demain", today: "aujourd'hui",
    at: "à", from: "Prise en charge", to: "Destination",
    onway: "Je suis en route", arriving: "Je devrais arriver vers",
    details: "Les détails de votre trajet",
    who: "Passagers", anything: "La moindre question, écrivez-moi ici.",
  },
};

/** The stops as the customer knows them: their own, never the driver's base. */
const LOCALE: Record<string, string> = { pt: "pt-BR", en: "en-CA", fr: "fr-CA" };

/** "segunda-feira, 8 de setembro" rather than 2026-09-08: this is a message to
 *  a person, and the weekday is the part they check against their own plans. */
function spokenDate(iso: string, lang: string) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE[lang] ?? "pt-BR",
    { weekday: "long", day: "numeric", month: "long" });
}

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

  lines.push(`${W.hi}${name ? ` ${name}` : ""}${W.excl}`);
  lines.push("");

  if (kind === "before") {
    lines.push(`${W.remind} ${when}${trip.date ? `, ${spokenDate(trip.date, lang)}` : ""}${
      trip.time ? `${trip.date ? "," : ""} ${W.at} ${trip.time}` : ""}.`);
  } else {
    lines.push(`${W.onway}.${trip.time ? ` ${W.arriving} ${trip.time}.` : ""}`);
  }

  lines.push("");
  lines.push(`${W.from}${W.colon} ${from}`);
  lines.push(`${W.to}${W.colon} ${to}`);

  const heads = (Number(q.pax?.adults) || 0) + (Number(q.pax?.children) || 0)
    + (Number(q.pax?.infants) || 0);
  if (kind === "before" && heads > 0) lines.push(`${W.who}${W.colon} ${heads}`);

  if (link) {
    lines.push("");
    lines.push(`${W.details}${W.colon} ${link}`);
  }

  if (kind === "before") {
    lines.push("");
    lines.push(W.anything);
  }

  const sig = (s.bizName ?? "").trim();
  if (sig) { lines.push(""); lines.push(`— ${sig}`); }

  return lines.join("\n");
}
