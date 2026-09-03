import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "@/lib/state";
import { dedupeQuotes } from "@/lib/state";
import type { Quote, Settings } from "@/lib/types";
import { DEFAULTS } from "@/lib/types";

/* Every read and write of the driver's data, run on the server.
 *
 * These used to run in the browser against the database directly. They still
 * use the signed-in user's own token, so row-level security is unchanged and
 * this code cannot reach another owner's rows -- it simply runs where no
 * script on the page can see it, and where no key has to ship to reach it.
 */

function rowFrom(q: Quote, owner: string, customerView?: unknown) {
  const dated = (q.trips ?? []).map((t) => t.date).filter(Boolean).sort();
  // The status is deliberately absent, here and inside data. A save carries
  // the content of a quote; the status is changed by an act -- the driver
  // pressing the pill, or a customer answering -- and only those write it.
  // Leaving it out of the bulk save is what makes it impossible to clobber:
  // an omitted column keeps its stored value on update, and takes the table
  // default of 'draft' on insert, which is what a new quote is anyway.
  const { status: _drop, ...content } = q;
  return {
    id: q.id, owner,
    quote_no: q.quoteNo || null,
    customer: q.customer || null,
    contact: q.contact || null,
    notes: q.notes || null,
    origin: q.origin ?? "driver",
    first_date: dated[0] || null,
    price: Number(q.price) || 0,
    tip: (q.trips ?? []).reduce((n, t) => n + (Number(t.tip) || 0), 0),
    cost: Number(q.cost) || 0,
    total_km: Number(q.totalKm) || 0,
    data: content,
    // What the customer is allowed to see, decided here rather than in SQL.
    ...(customerView ? { customer_view: customerView } : {}),
  };
}

export async function pull(sb: SupabaseClient): Promise<Partial<AppState> | null> {
  const [{ data: rows, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select("data,status,share_token").order("seq", { ascending: false }),
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
        .map((r: any) => (r.data ? { ...r.data, status: r.status ?? "draft", shareToken: r.share_token } : null))
        .filter(Boolean) as Quote[],
    ),
  };
}

/** Counts a customer corrected while this app had the quote open.
 *
 *  A save writes the whole content of a quote, so without this the driver's
 *  older copy would quietly undo the correction. The customer is the authority
 *  on what they are carrying, so their numbers win and everything else stays
 *  the driver's. The status needs no such rule: it is not part of a save. */
async function withCustomerEdits(sb: SupabaseClient, quotes: Quote[]): Promise<Quote[]> {
  const ids = quotes.map((q) => q.id).filter(Boolean);
  if (!ids.length) return quotes;

  const { data, error } = await sb.from("quotes").select("id,data").in("id", ids);
  if (error || !data) return quotes;          // never block a save on this

  const remote = new Map<string, Quote>();
  data.forEach((r: { id: string; data: Quote }) => { if (r?.data) remote.set(r.id, r.data); });

  return quotes.map((q) => {
    const r = remote.get(q.id);
    const theirs = r?.customerEditedAt;
    if (!theirs) return q;
    if (q.customerEditedAt && q.customerEditedAt >= theirs) return q;   // already seen
    return { ...q, pax: r.pax ?? q.pax, gear: r.gear ?? q.gear, bags: r.bags ?? q.bags,
             customerEditedAt: theirs };
  });
}

/** Forget every corrected distance. Explicit, because a save must never be
 *  able to infer this from an empty set it might simply have failed to load. */
export async function clearLearned(sb: SupabaseClient, owner: string) {
  const { error } = await sb.from("learned").delete().eq("owner", owner);
  if (error) throw new Error(error.message);
}

/** The address a customer's link carries. A quote saved a moment ago has one
 *  only because the database minted it on insert, so it has to be read back
 *  before a link can be built from it. */
export async function fetchShareToken(sb: SupabaseClient, id: string) {
  const { data, error } = await sb.from("quotes").select("share_token").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.share_token as string | undefined) ?? null;
}

/** Changing a status is an act, not a side effect of saving, so it is its own
 *  write. Whoever does it last means it -- the driver reversing an approval a
 *  customer just gave included. */
export async function setQuoteStatus(sb: SupabaseClient, id: string, status: string) {
  const { error } = await sb.from("quotes").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function push(
  sb: SupabaseClient,
  owner: string,
  st: AppState,
  viewOf?: (q: Quote) => unknown,
) {
  let adopted: Quote[] | null = null;
  if (st.quotes.length) {
    const merged = await withCustomerEdits(sb, st.quotes);
    const { error } = await sb
      .from("quotes")
      .upsert(merged.map((q) => rowFrom(q, owner, viewOf?.(q))), { onConflict: "id" });
    if (error) throw new Error(error.message);
    // Only worth handing back when a customer's correction was actually taken.
    if (merged.some((q, i) => q !== st.quotes[i])) adopted = merged;
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

  // Absence has to mean something here, or "forget corrected distances" only
  // clears the screen and the rows return on the next load.
  const pairs = Object.entries(st.learned ?? {});
  if (pairs.length) {
    const { error: e3 } = await sb.from("learned")
      .upsert(pairs.map(([pair, km]) => ({ owner, pair, km })), { onConflict: "owner,pair" });
    if (e3) throw new Error(e3.message);
  }
  // Deliberately no deletion here. Inferring it from an empty set would mean
  // that any load which failed to fetch them -- offline, a hiccup, a stale tab
  // -- looks identical to "forget them all", and the next save would wipe
  // them. Forgetting is an act, and has its own function below.

  return adopted;
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

/* ---------- taking a copy, and putting one back ---------- */

export type Backup = {
  app: "transfer-meter";
  version: 1;
  exportedAt: string;
  quotes: { id: string; status: string; share_token: string; data: unknown; customer_view: unknown }[];
  settings: { data: unknown; draft: unknown } | null;
  learned: { pair: string; km: number }[];
};

/** Everything, exactly as stored -- including each quote's share token, so a
 *  restored quote keeps the link already sent to its customer. */
export async function exportAll(sb: SupabaseClient): Promise<Backup> {
  const [{ data: quotes, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select("id,status,share_token,data,customer_view").order("seq"),
    sb.from("settings").select("data,draft").limit(1).maybeSingle(),
    sb.from("learned").select("pair,km"),
  ]);
  if (e1) throw new Error(e1.message);
  return {
    app: "transfer-meter",
    version: 1,
    exportedAt: new Date().toISOString(),
    quotes: (quotes ?? []) as Backup["quotes"],
    settings: (cfg ?? null) as Backup["settings"],
    learned: (lrn ?? []) as Backup["learned"],
  };
}

/** Put a backup back.
 *
 *  Adds and overwrites; never deletes. A quote in the database and not in the
 *  file is left alone, because the likeliest reason to restore is that
 *  something went missing, and the likeliest way to make that worse is to
 *  remove whatever survived.
 *
 *  The owner in the file is ignored: rows are written to whoever is signed in,
 *  so a backup can be restored into a different account and cannot be used to
 *  write into somebody else's. */
export async function importAll(
  sb: SupabaseClient, owner: string, backup: Backup,
  opts: { replace?: boolean } = {},
) {
  if (backup?.app !== "transfer-meter") throw new Error("That is not a Transfer Meter backup.");
  if (backup.version !== 1) throw new Error(`That backup is version ${backup.version}; this app reads version 1.`);

  let quotes = 0, learned = 0;
  if (Array.isArray(backup.quotes) && backup.quotes.length) {
    const rows = backup.quotes
      .filter((q) => q && typeof q.id === "string" && q.data)
      .map((q) => ({
        id: q.id, owner,
        status: typeof q.status === "string" ? q.status : "draft",
        ...(typeof q.share_token === "string" && q.share_token ? { share_token: q.share_token } : {}),
        data: q.data,
        customer_view: q.customer_view ?? null,
      }));
    if (rows.length) {
      const { error } = await sb.from("quotes").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
      quotes = rows.length;
    }
  }

  if (backup.settings?.data) {
    const { error } = await sb.from("settings").upsert(
      { owner, data: backup.settings.data, draft: backup.settings.draft ?? {} },
      { onConflict: "owner" });
    if (error) throw new Error(error.message);
  }

  if (Array.isArray(backup.learned) && backup.learned.length) {
    const rows = backup.learned
      .filter((l) => l && typeof l.pair === "string" && Number.isFinite(Number(l.km)))
      .map((l) => ({ owner, pair: l.pair, km: Number(l.km) }));
    if (rows.length) {
      const { error } = await sb.from("learned").upsert(rows, { onConflict: "owner,pair" });
      if (error) throw new Error(error.message);
      learned = rows.length;
    }
  }

  // Replacing is the other half of restoring: without it, junk added since the
  // backup survives it -- and the quote numbering, which counts up from the
  // highest number present, keeps counting from the junk.
  let removed = 0;
  if (opts.replace) {
    const keep = new Set((backup.quotes ?? []).map((q) => q?.id).filter(Boolean) as string[]);
    const { data: have } = await sb.from("quotes").select("id");
    // Naming the rows to delete, rather than filtering by "everything except
    // this list": a quote id is safe in a list and awkward inside a filter
    // string, and the failure mode of getting that wrong is deleting the wrong
    // rows silently.
    const drop = (have ?? []).map((r: { id: string }) => r.id).filter((id) => !keep.has(id));
    if (drop.length) {
      const { error } = await sb.from("quotes").delete().in("id", drop);
      if (error) throw new Error(error.message);
      removed = drop.length;
    }

    const keepPairs = new Set((backup.learned ?? []).map((l) => l?.pair).filter(Boolean) as string[]);
    const { data: hadPairs } = await sb.from("learned").select("pair").eq("owner", owner);
    const dropPairs = (hadPairs ?? []).map((r: { pair: string }) => r.pair).filter((p) => !keepPairs.has(p));
    if (dropPairs.length) {
      const { error } = await sb.from("learned").delete().eq("owner", owner).in("pair", dropPairs);
      if (error) throw new Error(error.message);
    }
  }

  return { quotes, learned, removed, settings: !!backup.settings?.data };
}
