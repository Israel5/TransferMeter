import { countList, fmt, dur, shortName } from "./quote";
import { wordsFor } from "./words";
import { BAG_KEYS, GEAR_KEYS, PAX_KEYS } from "./types";
import type { Lang, Quote, SavedTrip, Settings } from "./types";

/* The words that go to a customer, and the driver's right to change them.
 *
 * Every message has a default here. Edit one and yours is used instead; leave
 * it alone, or empty it again, and the default comes back. Nothing is copied
 * into settings until it is actually changed, so improving a default reaches
 * everyone who never touched it.
 */

export type MessageKind = "quote" | "reminder" | "onway" | "owed";

export const MESSAGE_KINDS: { key: MessageKind; label: string; hint: string }[] = [
  { key: "quote", label: "Sending a quote", hint: "When you send the price and the link." },
  { key: "reminder", label: "Day-before reminder", hint: "The reminder from the Today screen." },
  { key: "onway", label: "On my way", hint: "Sent as you leave to collect them." },
  { key: "owed", label: "Asking to be paid", hint: "For a trip already driven and not yet paid." },
];

/** Every value a message may use. The names are deliberately plain and the
 *  same in all three languages: a template is easier to read than to translate. */
export const VARIABLES: { name: string; what: string }[] = [
  { name: "name", what: "Customer's full name" },
  { name: "first_name", what: "Just their first name" },
  { name: "quote_no", what: "Quote number, e.g. 2026-009" },
  { name: "when", what: "“tomorrow” or “today”, in their language" },
  { name: "date_time", what: "Date and time together, however much is known" },
  { name: "date", what: "Trip date, written out — Tuesday, 8 September" },
  { name: "time", what: "Pick-up time, 17:00" },
  { name: "leg", what: "“Outbound” or “Return”" },
  { name: "from", what: "Where you collect them" },
  { name: "to", what: "Where they are going" },
  { name: "km", what: "Their journey in km" },
  { name: "duration", what: "How long their journey takes" },
  { name: "price", what: "Price of this leg, $60" },
  { name: "total", what: "Total for the whole quote, $120" },
  { name: "passengers", what: "How many people" },
  { name: "passengers_detail", what: "Listed — 2 adults, 1 child" },
  { name: "child_seats", what: "Child seats they asked for" },
  { name: "luggage", what: "Their luggage, listed" },
  { name: "link", what: "The link to their quote" },
  { name: "business", what: "Your name, from settings" },
];

const LOCALE: Record<string, string> = { pt: "pt-BR", en: "en-CA", fr: "fr-CA" };

export function spokenDate(iso: string, lang: Lang) {
  const [y, m, d] = String(iso ?? "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE[lang] ?? "pt-BR",
    { weekday: "long", day: "numeric", month: "long" });
}

/* ---------- the defaults ---------- */

export const DEFAULTS: Record<MessageKind, Record<Lang, string>> = {
  quote: {
    pt: `Olá {{first_name}}!

Segue o orçamento do seu transfer{{quote_no_suffix}}:

{{from}} → {{to}}
{{date_time}}
Total: {{total}}

Você pode ver tudo e confirmar por aqui: {{link}}

Qualquer dúvida, é só me chamar.

— {{business}}`,
    en: `Hello {{first_name}}!

Here is the quote for your transfer{{quote_no_suffix}}:

{{from}} → {{to}}
{{date_time}}
Total: {{total}}

You can see everything and confirm here: {{link}}

Any questions, just ask.

— {{business}}`,
    fr: `Bonjour {{first_name}} !

Voici le devis pour votre transfert{{quote_no_suffix}} :

{{from}} → {{to}}
{{date_time}}
Total : {{total}}

Vous pouvez tout voir et confirmer ici : {{link}}

La moindre question, écrivez-moi.

— {{business}}`,
  },
  reminder: {
    pt: `Olá {{first_name}}!

Passando pra lembrar do seu transfer {{when}}.
{{date_time}}

Embarque em: {{from}}
Destino: {{to}}
Passageiros: {{passengers}}

Detalhes da sua viagem: {{link}}

Qualquer dúvida, é só me chamar por aqui.

— {{business}}`,
    en: `Hello {{first_name}}!

Just a reminder about your transfer {{when}}.
{{date_time}}

Pick-up: {{from}}
Going to: {{to}}
Passengers: {{passengers}}

Your trip details: {{link}}

Any questions, just message me here.

— {{business}}`,
    fr: `Bonjour {{first_name}} !

Petit rappel pour votre transfert {{when}}.
{{date_time}}

Prise en charge : {{from}}
Destination : {{to}}
Passagers : {{passengers}}

Les détails de votre trajet : {{link}}

La moindre question, écrivez-moi ici.

— {{business}}`,
  },
  onway: {
    pt: `Olá {{first_name}}!

Já estou a caminho.
Devo chegar por volta das {{time}}.

Embarque em: {{from}}
Destino: {{to}}

Detalhes da sua viagem: {{link}}

— {{business}}`,
    en: `Hello {{first_name}}!

I'm on my way.
I should be there around {{time}}.

Pick-up: {{from}}
Going to: {{to}}

Your trip details: {{link}}

— {{business}}`,
    fr: `Bonjour {{first_name}} !

Je suis en route.
Je devrais arriver vers {{time}}.

Prise en charge : {{from}}
Destination : {{to}}

Les détails de votre trajet : {{link}}

— {{business}}`,
  },
  owed: {
    pt: `Olá {{first_name}}!

Tudo bem? Passando só pra lembrar do transfer de {{date}}, {{from}} → {{to}}.

Ficou {{price}}. Quando puder, é só me avisar.

Obrigado!

— {{business}}`,
    en: `Hello {{first_name}}!

Hope all is well. Just a note about the transfer on {{date}}, {{from}} → {{to}}.

It came to {{price}}. Whenever suits you.

Thank you!

— {{business}}`,
    fr: `Bonjour {{first_name}} !

J'espère que tout va bien. Un petit mot au sujet du transfert du {{date}}, {{from}} → {{to}}.

Le montant est de {{price}}. Quand cela vous convient.

Merci !

— {{business}}`,
  },
};

/** Asking for money is the message most worth being able to reword: what
 *  reads as friendly from one driver reads as pushy from another, and only you
 *  know which of your customers is which. */

/** The template in force: yours if you have written one, the default otherwise.
 *  An override that is blank counts as no override, so clearing the box is how
 *  you go back. */
export function templateFor(kind: MessageKind, lang: Lang, s: Settings): string {
  const mine = s.templates?.[kind]?.[lang];
  return typeof mine === "string" && mine.trim() ? mine : DEFAULTS[kind][lang] ?? DEFAULTS[kind].pt;
}

export function isCustom(kind: MessageKind, lang: Lang, s: Settings): boolean {
  const mine = s.templates?.[kind]?.[lang];
  return typeof mine === "string" && mine.trim().length > 0;
}

/* ---------- filling it in ---------- */

export type Vars = Record<string, string>;

const WHEN: Record<Lang, { today: string; tomorrow: string }> = {
  pt: { today: "hoje", tomorrow: "amanhã" },
  en: { today: "today", tomorrow: "tomorrow" },
  fr: { today: "aujourd'hui", tomorrow: "demain" },
};

const LEG: Record<Lang, { out: string; ret: string }> = {
  pt: { out: "Ida", ret: "Volta" },
  en: { out: "Outbound", ret: "Return" },
  fr: { out: "Aller", ret: "Retour" },
};

const NO: Record<Lang, string> = { pt: " nº", en: " no.", fr: " nº" };
const AT: Record<Lang, string> = { pt: "às", en: "at", fr: "à" };

/** Date and time as one phrase, because joining them in a template means
 *  writing punctuation around values that may not be there -- and a trip with
 *  no time recorded then reads "amanhã, , às .". Composing it here handles
 *  every combination once, in the one place that knows which are missing. */
function dateAndTime(date: string, time: string, lang: Lang): string {
  const d = date ? spokenDate(date, lang) : "";
  if (d && time) return `${d}, ${AT[lang] ?? "às"} ${time}`;
  if (d) return d;
  if (time) return `${AT[lang] ?? "às"} ${time}`;
  return "";
}

export function varsFor(
  q: Quote, trip: SavedTrip | undefined, link: string, s: Settings, lang: Lang,
  opts: { when?: "today" | "tomorrow" } = {},
): Vars {
  const named = (trip?.stops ?? [])
    .filter((st) => !st.base && String(st.name || "").trim())
    .map((st) => shortName(st.name));
  const heads = (Number(q.pax?.adults) || 0) + (Number(q.pax?.children) || 0)
    + (Number(q.pax?.infants) || 0);
  // Worded in the customer's own language -- "2 malas, 2 bagagens de mão" --
  // rather than the keys they are stored under.
  const W = wordsFor(lang);
  const bagWords = countList(q.bags ?? {}, BAG_KEYS, W as never);
  const gearWords = countList(q.gear ?? {}, GEAR_KEYS, W as never);
  const paxWords = countList(q.pax ?? {}, PAX_KEYS, W as never);
  const total = (q.trips ?? []).reduce((n, t) => n + (Number(t.price) || 0), 0);
  const no = (q.quoteNo ?? "").trim();

  return {
    name: (q.customer ?? "").trim(),
    first_name: (q.customer ?? "").trim().split(/\s+/)[0] ?? "",
    quote_no: no,
    // A number only reads well with its word in front, and neither should
    // appear when the quote has no number yet.
    quote_no_suffix: no ? `${NO[lang] ?? " nº"} ${no}` : "",
    when: opts.when ? WHEN[lang][opts.when] : "",
    date_time: dateAndTime(trip?.date ?? "", trip?.time ?? "", lang),
    date: trip?.date ? spokenDate(trip.date, lang) : "",
    time: trip?.time ?? "",
    leg: trip ? (trip.label === "Return" ? LEG[lang].ret : LEG[lang].out) : "",
    from: named[0] ?? "",
    to: named[named.length - 1] ?? "",
    km: trip ? `${fmt(trip.paxKm ?? trip.totalKm ?? 0, 1)} km` : "",
    duration: trip?.paxMins ? dur(trip.paxMins) : "",
    price: trip ? `$${fmt(trip.price ?? 0, 0)}` : "",
    total: total ? `$${fmt(total, 0)}` : "",
    passengers: heads ? String(heads) : "",
    passengers_detail: paxWords,
    child_seats: gearWords,
    luggage: bagWords,
    link,
    business: (s.bizName ?? "").trim(),
  };
}

/** Substitute, then clear up after the values that were not there.
 *
 *  A line whose variables all came back empty is dropped whole, so a trip with
 *  no time recorded does not leave "às ." sitting in the message. Unknown names
 *  are left visible rather than silently removed: a typo you can see is a typo
 *  you can fix. */
export function renderTemplate(tpl: string, vars: Vars): string {
  const lines = String(tpl ?? "").split("\n").map((line) => {
    let used = 0, empty = 0;
    const out = line.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!(name in vars)) return whole;
      used++;
      const v = vars[name] ?? "";
      if (!v) empty++;
      return v;
    });
    return used > 0 && used === empty ? null : out;
  }).filter((l): l is string => l !== null);

  return lines
    .join("\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildMessage(
  kind: MessageKind, q: Quote, trip: SavedTrip | undefined, link: string,
  s: Settings, lang: Lang, opts: { when?: "today" | "tomorrow" } = {},
): string {
  return renderTemplate(templateFor(kind, lang, s), varsFor(q, trip, link, s, lang, opts));
}
