import type { Settings } from "./types";

/** Strip what a paste from WhatsApp carries invisibly.
 *
 *  Copying a contact out of WhatsApp brings direction marks so a leading "+"
 *  renders correctly beside right-to-left scripts, plus non-breaking spaces and
 *  hyphens so the number never wraps. None of it is visible, all of it breaks a
 *  naive comparison, and trim() removes none of it. */
export function cleanContact(raw: string) {
  return String(raw ?? "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")  // invisible marks
    .replace(/[\u00A0\u2007\u202F]/g, " ")                             // non-breaking spaces
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-")                 // hyphen lookalikes
    .trim();
}

/** Accepts what people actually paste: local, international, a wa.me link, a handle. */
export function waClean(raw: string) {
  return cleanContact(raw)
    .replace(/^https?:\/\//i, "")
    .replace(/^(wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send)\/?\??(phone=)?/i, "")
    .trim();
}

export function waHandle(raw: string) {
  const c = waClean(raw);
  if (!c) return "";
  return /[a-z]/i.test(c) ? c.replace(/^@/, "") : "";
}

export function waDigits(raw: string, s: Settings) {
  const c = waClean(raw);
  if (!c || /[a-z]/i.test(c)) return "";
  let d = c.replace(/\D/g, "");
  if (!d) return "";
  // 011 in North America, 00 elsewhere: an international prefix, not the number.
  if (/^011\d{10,}$/.test(d)) d = d.slice(3);
  else if (/^00\d{9,}$/.test(d)) d = d.slice(2);
  if (!c.startsWith("+") && d.length <= 10) {
    d = String(s.countryCode || "1").replace(/\D/g, "") + d.replace(/^0+/, "");
  }
  return d;
}

/** wa.me addresses a chat two ways: by number, or by @username. */
export function waLink(raw: string, text: string, s: Settings) {
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  const d = waDigits(raw, s);
  if (d) return `https://wa.me/${d}${query}`;
  const h = waHandle(raw);
  if (h) return `https://wa.me/@${encodeURIComponent(h)}${query}`;
  return null;
}

export function waPretty(raw: string, s: Settings) {
  const d = waDigits(raw, s);
  if (d) return `+${d}`;
  const h = waHandle(raw);
  return h ? `@${h}` : "";
}
