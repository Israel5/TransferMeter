import { fmt, dur, niceDate, countList, customerView, shortName, tripTotals } from "./quote";
import { wordsFor } from "./words";
import { PAX_KEYS, GEAR_KEYS, BAG_KEYS } from "./types";
import type { AppState } from "./state";
import type { Quote, Settings } from "./types";

/** The quote as a message. Built from a saved snapshot, or from the editor. */
export function quoteMessage(q: Quote): string {
  const W = wordsFor(q.lang);
  const parts: string[] = [];
  parts.push("Transfer" + (q.customer ? ` — ${q.customer}` : ""));
  if (q.quoteNo) parts.push(`${W.no} ${q.quoteNo}`);
  parts.push("");

  (q.trips ?? []).forEach((t) => {
    const v = customerView(t.stops, t.legKm, t.paxKm, t.paxMins);
    const named = v.stops.map((s) => shortName(s.name || ""));
    parts.push((t.label === "Return" ? W.ret : W.out)
      + (t.date ? ` · ${niceDate(t.date, q.lang)}` : "")
      + (t.time ? ` · ${W.at} ${t.time}` : ""));
    parts.push(`${named[0] ?? "—"} → ${named[named.length - 1] ?? "—"}`);
    parts.push(`${fmt(v.km, 0)} km · ${dur(v.mins)} · $${fmt(t.price, 0)} CAD`);
    parts.push("");
  });

  const p = countList(q.pax ?? {}, PAX_KEYS, W as any);
  const g = countList(q.gear ?? {}, GEAR_KEYS, W as any);
  const b = countList(q.bags ?? {}, BAG_KEYS, W as any);
  if (p) parts.push(`${W.pax}: ${p}`);
  if (g) parts.push(`${W.gear}: ${g}`);
  if (b) parts.push(`${W.bags}: ${b}`);
  if (p || g || b) parts.push("");

  parts.push(`${W.total}: $${fmt((q.trips ?? []).reduce((n, t) => n + (t.price ?? 0), 0), 0)} CAD`);
  parts.push("");
  parts.push(W.note);
  return parts.join("\n");
}

/** The editor's live version, before anything is saved. */
export function draftMessage(st: AppState): string {
  const W = wordsFor(st.lang);
  const parts: string[] = [];
  parts.push("Transfer" + (st.customer.trim() ? ` — ${st.customer.trim()}` : ""));
  if (st.quoteNo.trim()) parts.push(`${W.no} ${st.quoteNo.trim()}`);
  parts.push("");

  st.trips.forEach((t) => {
    const x = tripTotals(t, st.settings, st.learned);
    const named = t.stops.filter((s) => !s.base && String(s.name || "").trim()).map((s) => shortName(s.name));
    parts.push((t.label === "Return" ? W.ret : W.out)
      + (t.date ? ` · ${niceDate(t.date, st.lang)}` : "")
      + (t.time ? ` · ${W.at} ${t.time}` : ""));
    parts.push(`${named[0] ?? "—"} → ${named[named.length - 1] ?? "—"}`);
    parts.push(`${fmt(x.loaded, 0)} km · ${dur(x.loadedMins)} · $${fmt(x.price, 0)} CAD`);
    parts.push("");
  });

  const p = countList(st.pax, PAX_KEYS, W as any);
  const g = countList(st.gear, GEAR_KEYS, W as any);
  const b = countList(st.bags, BAG_KEYS, W as any);
  if (p) parts.push(`${W.pax}: ${p}`);
  if (g) parts.push(`${W.gear}: ${g}`);
  if (b) parts.push(`${W.bags}: ${b}`);
  if (p || g || b) parts.push("");

  const total = st.trips.reduce((n, t) => n + tripTotals(t, st.settings, st.learned).price, 0);
  parts.push(`${W.total}: $${fmt(total, 0)} CAD`);
  parts.push("");
  parts.push(W.note);
  return parts.join("\n");
}

/** What a customer link carries. Never the home address, cost, tip or notes. */
export function customerPayload(q: Quote, s: Settings, waDigits: (v: string) => string) {
  const W = wordsFor(q.lang);
  return {
    b: (s.bizName ?? "").trim(),
    p: (s.bizPhone ?? "").trim(),
    w: waDigits(s.bizWhats) || waDigits(s.bizPhone) || "",
    n: q.quoteNo ?? "", c: q.customer ?? "", l: q.lang,
    t: (q.trips ?? []).map((t) => {
      const v = customerView(t.stops, t.legKm, t.paxKm, t.paxMins);
      return {
        k: t.label === "Return" ? "ret" : "out",
        d: t.date || "", h: t.time || "",
        s: v.stops.map((st) => st.name || "—"),
        m: v.legKm.map((n) => Math.round(n * 10) / 10),
        km: Math.round(v.km * 10) / 10, mn: Math.round(v.mins), pr: t.price ?? 0,
      };
    }),
    x: {
      ...(countList(q.pax ?? {}, PAX_KEYS, W as any) ? { pax: countList(q.pax ?? {}, PAX_KEYS, W as any) } : {}),
      ...(countList(q.gear ?? {}, GEAR_KEYS, W as any) ? { gear: countList(q.gear ?? {}, GEAR_KEYS, W as any) } : {}),
      ...(countList(q.bags ?? {}, BAG_KEYS, W as any) ? { bags: countList(q.bags ?? {}, BAG_KEYS, W as any) } : {}),
    },
    tot: (q.trips ?? []).reduce((n, t) => n + (t.price ?? 0), 0),
  };
}

export function encodePayload(obj: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePayload(str: string) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
