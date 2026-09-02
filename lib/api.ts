"use client";

import type { AppState } from "./state";
import type { Quote } from "./types";

/* Everything the browser is allowed to know about the database: nothing.
 *
 * These call this site's own routes and no further. There is no key in the
 * page, no database address, and no session token a script could read -- the
 * cookie that carries it is httpOnly, so the browser attaches it and no code
 * can. Each of these has a matching route under app/api which does the actual
 * work with the signed-in user's own token, so row-level security still
 * decides what may be touched.
 */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const said = await r.json().catch(() => null);
  if (!r.ok) throw new Error(said?.error || "That didn't work. Please try again.");
  return said as T;
}

/* ---------- who is here ---------- */

export async function currentSession(): Promise<boolean> {
  try { return (await call<{ signedIn: boolean }>("/api/auth/session")).signedIn; }
  catch { return false; }
}

export async function signIn(email: string, password: string) {
  await call("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

export async function signOut() {
  await call("/api/auth/logout", { method: "POST" });
}

/* ---------- the driver's own data ---------- */

export async function pull(): Promise<Partial<AppState> | null> {
  return call<Partial<AppState> | null>("/api/data");
}

/** Returns the quotes whose customer-corrected counts were adopted, or null. */
export async function push(state: AppState): Promise<Quote[] | null> {
  const r = await call<{ adopted: Quote[] | null }>("/api/data", {
    method: "PUT", body: JSON.stringify(state),
  });
  return r.adopted ?? null;
}

export async function setQuoteStatus(id: string, status: string) {
  await call(`/api/quotes/${encodeURIComponent(id)}/status`, {
    method: "PUT", body: JSON.stringify({ status }),
  });
}

export async function removeQuote(id: string) {
  await call(`/api/quotes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchShareToken(id: string) {
  return (await call<{ token: string | null }>(`/api/quotes/${encodeURIComponent(id)}/token`)).token;
}

export async function rotateShareToken(id: string) {
  return (await call<{ token: string }>(`/api/quotes/${encodeURIComponent(id)}/token`,
    { method: "POST" })).token;
}

export async function clearLearned() {
  await call("/api/learned", { method: "DELETE" });
}

/* ---------- what a customer's link opens ---------- */

export async function fetchQuoteByToken(token: string) {
  return call<Record<string, unknown>>(`/api/public/quote?t=${encodeURIComponent(token)}`);
}

export async function answerQuote(token: string, answer: "approved" | "declined") {
  return call<{ status: string }>("/api/public/quote", {
    method: "POST", body: JSON.stringify({ token, answer }),
  });
}

export async function updateQuoteCounts(
  token: string,
  counts: { pax?: Record<string, number>; gear?: Record<string, number>; bags?: Record<string, number> },
) {
  return call<{ xc?: Record<string, Record<string, number>> }>("/api/public/quote", {
    method: "PATCH", body: JSON.stringify({ token, counts }),
  });
}
