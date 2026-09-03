import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppState } from "@/lib/state";
import type { Quote, QuoteContent, Settings } from "@/lib/types";
import { DEFAULTS } from "@/lib/types";

/* Every read and write of the driver's data, run on the server.
 *
 * These used to run in the browser against the database directly. They still
 * use the signed-in user's own token, so row-level security is unchanged and
 * this code cannot reach another owner's rows -- it simply runs where no
 * script on the page can see it, and where no key has to ship to reach it.
 */

/** The columns that make a stored quote out of its content. */
const QUOTE_COLUMNS = "id,quote_no,status,share_token,data";

type Row = {
  id: number; quote_no: string | null; status: string | null;
  share_token: string | null; data: QuoteContent & { savedAt?: string; customerEditedAt?: string };
};

const toQuote = (r: Row): Quote => ({
  ...r.data,
  id: r.id,
  quoteNo: r.quote_no ?? "",
  status: (r.status ?? "draft") as Quote["status"],
  shareToken: r.share_token ?? undefined,
  savedAt: r.data?.savedAt ?? "",
});

/** Create one. The database issues the id, and the number follows from it. */
export async function createQuote(
  sb: SupabaseClient, owner: string, content: QuoteContent,
): Promise<Quote> {
  const { data, error } = await sb
    .from("quotes")
    .insert({
      owner,
      // Only what the quote says. There used to be a column mirroring each of
      // customer, price, cost and the rest, written on every save and read by
      // nothing; a second copy of a fact that already has a home is how the
      // status came to disagree with itself twice.
      data: { ...content, savedAt: new Date().toISOString() },
    })
    .select(QUOTE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toQuote(data as Row);
}

/** Update one that already exists. */
export async function updateQuote(
  sb: SupabaseClient, id: number, content: QuoteContent,
): Promise<Quote> {
  const { data, error } = await sb
    .from("quotes")
    .update({ data: content })
    .eq("id", id)
    .select(QUOTE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toQuote(data as Row);
}

/** Repair settings on the way in.
 *
 *  A browser holding an older shape will write it back over anything changed
 *  underneath it, so a change to stored data alone does not stick. Mending it
 *  here means it mends itself on the next load, whatever is in the row.
 *
 *  Bands were five numbered fields before they were a list. If the list is
 *  missing or empty and those fields are there, they are the list. */
function repair(data: Record<string, unknown>): Settings {
  const s = { ...DEFAULTS, ...(data as Partial<Settings>) };
  const bands = Array.isArray(s.bands) ? s.bands.filter((b) => b && Number(b.price) > 0) : [];

  const legacy = data as Record<string, number | undefined>;
  if (!bands.length && Number(legacy.t1) > 0) {
    s.bands = [
      ...(Number(legacy.t1max) > 0 ? [{ upTo: Number(legacy.t1max), price: Number(legacy.t1) }] : []),
      ...(Number(legacy.t2max) > 0 ? [{ upTo: Number(legacy.t2max), price: Number(legacy.t2) }] : []),
      { upTo: null, price: Number(legacy.t3) || Number(legacy.t2) || Number(legacy.t1) },
    ];
  } else if (!bands.length) {
    s.bands = DEFAULTS.bands;
  } else {
    s.bands = bands;
  }

  // The fields the list replaced, so they cannot come back a third time.
  for (const k of ["t1max", "t1", "t2max", "t2", "t3"]) delete (s as Record<string, unknown>)[k];
  return s;
}

export async function pull(sb: SupabaseClient): Promise<Partial<AppState> | null> {
  const [{ data: rows, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select(QUOTE_COLUMNS),
    sb.from("settings").select("data,draft").limit(1).maybeSingle(),
    sb.from("learned").select("pair,km"),
  ]);
  if (e1) throw new Error(e1.message);

  const learned: Record<string, number> = {};
  (lrn ?? []).forEach((r: any) => { learned[r.pair] = Number(r.km); });

  const draft = (cfg?.draft ?? {}) as Partial<AppState>;
  return {
    ...draft,
    settings: repair((cfg?.data ?? {}) as Record<string, unknown>),
    learned,
    // The token lives on the row, not in the snapshot: it addresses the quote
    // for a customer and should not travel inside exported data.
    // Newest first, by id. The id is the order they were created in, it is
    // the number on the quote, it survives a restore, and unlike a date
    // inside the blob it cannot be missing -- one quote without a savedAt was
    // enough to drop it to the bottom of the list.
    quotes: (rows ?? [])
      .filter((r: Row) => r?.data)
      .map(toQuote)
      .sort((a, b) => b.id - a.id),
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

  const remote = new Map<number, Quote>();
  data.forEach((r: { id: number; data: Quote }) => { if (r?.data) remote.set(r.id, r.data); });

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
export async function fetchShareToken(sb: SupabaseClient, id: number) {
  const { data, error } = await sb.from("quotes").select("share_token").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.share_token as string | undefined) ?? null;
}

/** Changing a status is an act, not a side effect of saving, so it is its own
 *  write. Whoever does it last means it -- the driver reversing an approval a
 *  customer just gave included. */
export async function setQuoteStatus(sb: SupabaseClient, id: number, status: string) {
  const { error } = await sb.from("quotes").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function push(sb: SupabaseClient, owner: string, st: AppState) {
  // Only quotes that already exist. Creating one needs its id back, so it is
  // its own call rather than a side effect of saving everything.
  const existing = st.quotes.filter((q) => Number(q.id) > 0);
  let adopted: Quote[] | null = null;
  if (existing.length) {
    const merged = await withCustomerEdits(sb, existing);
    const rows = merged.map((q) => ({ id: q.id, owner, data: contentOf(q) }));
    const { error } = await sb.from("quotes").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
    if (merged.some((q, i) => q !== existing[i])) adopted = merged;
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

  // Deliberately no deletion here. Inferring it from an empty set would mean
  // that any load which failed to fetch them -- offline, a hiccup, a stale tab
  // -- looks identical to "forget them all", and the next save would wipe
  // them. Forgetting is an act, and has its own function below.
  const pairs = Object.entries(st.learned ?? {});
  if (pairs.length) {
    const { error: e3 } = await sb.from("learned")
      .upsert(pairs.map(([pair, km]) => ({ owner, pair, km })), { onConflict: "owner,pair" });
    if (e3) throw new Error(e3.message);
  }

  return adopted;
}

/** Deleting is deliberate; absence from a save never removes anything. */
export async function removeQuote(sb: SupabaseClient, id: number) {
  const { error } = await sb.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Give a quote a new address, so any link already sent stops working. */
export async function rotateShareToken(sb: SupabaseClient, id: number) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const { error } = await sb.from("quotes").update({ share_token: token }).eq("id", id);
  if (error) throw new Error(error.message);
  return token;
}

/** A stored quote stripped back to what it says, for writing. */
function contentOf(q: Quote): QuoteContent & { savedAt?: string; customerEditedAt?: string } {
  const { id, quoteNo, status, shareToken, ...content } = q;
  return content;
}

/* ---------- taking a copy, and putting one back ---------- */

export type Backup = {
  app: "transfer-meter";
  version: 1;
  exportedAt: string;
  quotes: { id: number; quote_no: string; status: string; share_token: string;
            data: unknown }[];
  settings: { data: unknown; draft: unknown } | null;
  learned: { pair: string; km: number }[];
};

/** Everything, exactly as stored -- including each quote's share token, so a
 *  restored quote keeps the link already sent to its customer. */
export async function exportAll(sb: SupabaseClient): Promise<Backup> {
  const [{ data: quotes, error: e1 }, { data: cfg }, { data: lrn }] = await Promise.all([
    sb.from("quotes").select("id,quote_no,status,share_token,data").order("id"),
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
      .filter((q) => q && Number.isInteger(Number(q.id)) && q.data)
      .map((q) => ({
        id: Number(q.id), owner,
        ...(typeof q.quote_no === "string" && q.quote_no ? { quote_no: q.quote_no } : {}),
        status: typeof q.status === "string" ? q.status : "draft",
        ...(typeof q.share_token === "string" && q.share_token ? { share_token: q.share_token } : {}),
        data: q.data,
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
    const keep = new Set((backup.quotes ?? []).map((q) => Number(q?.id)).filter(Boolean));
    const { data: have } = await sb.from("quotes").select("id");
    // Naming the rows to delete, rather than filtering by "everything except
    // this list": a quote id is safe in a list and awkward inside a filter
    // string, and the failure mode of getting that wrong is deleting the wrong
    // rows silently.
    const drop = (have ?? []).map((r: { id: number }) => r.id).filter((id) => !keep.has(id));
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

  // Restoring writes ids the database did not hand out, and an identity column
  // does not advance for those. Without this the next new quote would ask for
  // an id that a restored row already has, and the insert would fail. This is
  // the setval that has to happen, and it belongs here rather than in anyone's
  // memory of running it afterwards.
  if (quotes) {
    const { error } = await sb.rpc("sync_quote_ids");
    if (error) throw new Error(error.message);
  }

  return { quotes, learned, removed, settings: !!backup.settings?.data };
}
