"use client";

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import type { AppState } from "./state";
import { dedupeQuotes } from "./state";
import type { Quote, Settings } from "./types";
import { DEFAULTS } from "./types";

export type PublicConfig = { supabase: { url: string; anonKey: string } | null; country: string };

let client: SupabaseClient | null = null;

export function getClient(cfg: PublicConfig["supabase"]) {
  if (!cfg) return null;
  if (!client) {
    client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** A magic link: no password is ever created, stored or handled. */
export async function sendMagicLink(sb: SupabaseClient, email: string) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(error.message);
}

function rowFrom(q: Quote, owner: string) {
  const dated = (q.trips ?? []).map((t) => t.date).filter(Boolean).sort();
  return {
    id: q.id, owner,
    quote_no: q.quoteNo || null,
    customer: q.customer || null,
    contact: q.contact || null,
    notes: q.notes || null,
    status: q.status || "draft",
    origin: q.origin ?? "driver",
    first_date: dated[0] || null,
    price: Number(q.price) || 0,
    tip: (q.trips ?? []).reduce((n, t) => n + (Number(t.tip) || 0), 0),
    cost: Number(q.cost) || 0,
    total_km: Number(q.totalKm) || 0,
    data: q,
  };
}

export async function pull(sb: SupabaseClient): Promise<Partial<AppState> | null> {
  const [{ data: rows, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select("data").order("seq", { ascending: false }),
    sb.from("settings").select("data,draft").limit(1).maybeSingle(),
    sb.from("learned").select("pair,km"),
  ]);
  if (e1) throw new Error(e1.message);

  const learned: Record<string, number> = {};
  (lrn ?? []).forEach((r: any) => { learned[r.pair] = Number(r.km); });

  const draft = (cfg?.draft ?? {}) as Partial<AppState>;
  return {
    ...draft,
    settings: { ...DEFAULTS, ...((cfg?.data ?? {}) as Settings) },
    learned,
    quotes: dedupeQuotes((rows ?? []).map((r: any) => r.data).filter(Boolean)),
  };
}

export async function push(sb: SupabaseClient, owner: string, st: AppState) {
  if (st.quotes.length) {
    const { error } = await sb.from("quotes").upsert(st.quotes.map((q) => rowFrom(q, owner)), { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  const { error: e2 } = await sb.from("settings").upsert(
    {
      owner,
      data: st.settings,
      draft: {
        trips: st.trips, active: st.active, pax: st.pax, gear: st.gear, bags: st.bags,
        customer: st.customer, contact: st.contact, notes: st.notes,
        quoteNo: st.quoteNo, editingId: st.editingId, lang: st.lang,
      },
    },
    { onConflict: "owner" },
  );
  if (e2) throw new Error(e2.message);

  const pairs = Object.entries(st.learned ?? {});
  if (pairs.length) {
    const { error: e3 } = await sb.from("learned")
      .upsert(pairs.map(([pair, km]) => ({ owner, pair, km })), { onConflict: "owner,pair" });
    if (e3) throw new Error(e3.message);
  }
}

/** Deleting is deliberate; absence from a save never removes anything. */
export async function removeQuote(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export type { Session };
