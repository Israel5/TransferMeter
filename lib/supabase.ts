"use client";

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import type { AppState } from "./state";
import { dedupeQuotes } from "./state";
import type { Quote, Settings } from "./types";
import { DEFAULTS } from "./types";

let client: SupabaseClient | null = null;

/** Compiled in at build time from Vercel's environment. Both values are public
 *  by design; row-level security is what actually guards the data. */
export function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

/** Sign in with a password.
 *
 *  Deliberately not a magic link: that would email the driver from Supabase,
 *  with Supabase's branding, to sign in to their own application. Nothing
 *  about the login should reveal, or depend on, who hosts the database. */
/** A customer correcting their own passenger and luggage counts. The database
 *  decides whether the quote is still open to it; this only carries the ask. */
export async function updateQuoteCounts(
  sb: SupabaseClient, token: string,
  counts: { pax?: Record<string, number>; gear?: Record<string, number>; bags?: Record<string, number> },
) {
  const { data, error } = await sb.rpc("update_quote_counts", { token, counts });
  if (error) throw error;
  return data as { xc?: Record<string, Record<string, number>> };
}

export async function signIn(sb: SupabaseClient, email: string, password: string) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      /invalid login/i.test(error.message)
        ? "That email and password don't match."
        : error.message,
    );
  }
}

export async function signOut(sb: SupabaseClient) {
  await sb.auth.signOut();
}

function rowFrom(q: Quote, owner: string, customerView?: unknown) {
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
    // What the customer is allowed to see, decided here rather than in SQL.
    ...(customerView ? { customer_view: customerView } : {}),
  };
}

export async function pull(sb: SupabaseClient): Promise<Partial<AppState> | null> {
  const [{ data: rows, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select("data,share_token").order("seq", { ascending: false }),
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
    // The token lives on the row, not in the snapshot: it addresses the quote
    // for a customer and should not travel inside exported data.
    quotes: dedupeQuotes(
      (rows ?? [])
        .map((r: any) => (r.data ? { ...r.data, shareToken: r.share_token } : null))
        .filter(Boolean) as Quote[],
    ),
  };
}

export async function push(
  sb: SupabaseClient,
  owner: string,
  st: AppState,
  viewOf?: (q: Quote) => unknown,
) {
  if (st.quotes.length) {
    const { error } = await sb
      .from("quotes")
      .upsert(st.quotes.map((q) => rowFrom(q, owner, viewOf?.(q))), { onConflict: "id" });
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

/** Give a quote a new address, so any link already sent stops working.
 *  The owner may update their own rows, so this needs no extra privilege. */
export async function rotateShareToken(sb: SupabaseClient, id: string) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await sb.from("quotes").update({ share_token: token }).eq("id", id);
  if (error) throw new Error(error.message);
  return token;
}

/** Read one quote as a customer would, using only the public key. */
export async function fetchQuoteByToken(sb: SupabaseClient, token: string) {
  const { data, error } = await sb.rpc("quote_by_token", { token });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

/** Record their answer. Postgres decides whether it is allowed. */
export async function answerQuote(sb: SupabaseClient, token: string, answer: "approved" | "declined") {
  const { data, error } = await sb.rpc("answer_quote", { token, answer });
  if (error) throw new Error(error.message);
  return data as { status: string; answered_at: string };
}

export type { Session };
