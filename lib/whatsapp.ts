import type { Settings } from "./types";

/** Accepts what people actually paste: local, international, a wa.me link, a handle. */
export function waClean(raw: string) {
  return String(raw ?? "").trim()
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

export function waLink(raw: string, text: string, s: Settings) {
  const d = waDigits(raw, s);
  if (!d) return null;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function waPretty(raw: string, s: Settings) {
  const d = waDigits(raw, s);
  if (d) return `+${d}`;
  const h = waHandle(raw);
  return h ? `@${h}` : "";
}
