// Move the quotes out of the old SQLite file and into Supabase.
//
//   node scripts/migrate-sqlite.mjs            # dry run: shows what would move
//   node scripts/migrate-sqlite.mjs --write    # actually writes
//
// Reads .env for SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_DB_URL. Uses
// the service key deliberately: this runs on your machine, and it has to write
// rows owned by you without a browser session.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

function env() {
  const out = {};
  const file = join(ROOT, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return { ...out, ...process.env };
}

const E = env();
const URL_ = E.SUPABASE_URL, KEY = E.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) { console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be in .env"); process.exit(1); }

const dbFile = join(ROOT, E.TRANSFER_DB || "data.db");
if (!existsSync(dbFile)) { console.error(`no ${dbFile} to migrate`); process.exit(1); }

/* ---------- read the old store ---------- */
const db = new DatabaseSync(dbFile);
const rows = db.prepare("SELECT data FROM quotes ORDER BY seq").all();
const quotes = rows.map((r) => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);

const metaOf = (k) => {
  const r = db.prepare("SELECT value FROM meta WHERE key=?").get(k);
  try { return r ? JSON.parse(r.value) : null; } catch { return null; }
};
const settings = metaOf("settings");
const draft = metaOf("draft");
const learned = {};
for (const r of db.prepare("SELECT pair, km FROM learned").all()) learned[r.pair] = Number(r.km);

/* ---------- who owns it ---------- */
const api = (path, opts = {}) =>
  fetch(URL_ + path, {
    ...opts,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

const users = await api("/auth/v1/admin/users?per_page=2").then((r) => r.json()).catch(() => null);
const owner = users?.users?.[0]?.id;
const ownerEmail = users?.users?.[0]?.email;

console.log(`\n  from   ${dbFile}`);
console.log(`  quotes ${quotes.length}`);
console.log(`  learned ${Object.keys(learned).length} corrected distances`);
console.log(`  owner  ${owner ? `${ownerEmail} (${owner})` : "none yet — create your account first"}\n`);

for (const q of quotes) {
  const legs = (q.trips || []).length;
  const tips = (q.trips || []).reduce((n, t) => n + (Number(t.tip) || 0), 0);
  console.log(`    ${String(q.quoteNo || "?").padEnd(9)} ${String(q.customer || "").padEnd(20)}` +
    ` $${String(q.price ?? 0).padEnd(5)} ${String(q.status || "draft").padEnd(9)}` +
    ` ${legs} leg${legs === 1 ? " " : "s"}${tips ? `  +$${tips} tip` : ""}`);
}

if (!owner) { console.log("\n  nothing written: no account exists yet.\n"); process.exit(0); }
if (!WRITE) { console.log("\n  dry run. Re-run with --write to move these across.\n"); process.exit(0); }

/* ---------- write ---------- */
const firstDate = (q) => ((q.trips || []).map((t) => t.date).filter(Boolean).sort()[0] || null);

// The old app had one "pending" state meaning "saved, waiting on the customer".
// That has since split into draft (not sent yet) and sent (awaiting an answer),
// and the old data cannot say which. "sent" matches what it used to mean.
const STATUS = { pending: "sent", approved: "approved", declined: "declined" };
const statusOf = (q) => STATUS[q.status] ?? (["draft","requested","sent","approved","declined"].includes(q.status) ? q.status : "draft");
const payload = quotes.map((q) => ({
  id: q.id, owner,
  quote_no: q.quoteNo || null, customer: q.customer || null, contact: q.contact || null,
  notes: q.notes || null, status: statusOf(q), origin: "driver",
  first_date: firstDate(q),
  price: Number(q.price) || 0,
  tip: (q.trips || []).reduce((n, t) => n + (Number(t.tip) || 0), 0),
  cost: Number(q.cost) || 0, total_km: Number(q.totalKm) || 0,
  // The app reads quotes out of this blob, so the mapped status has to be
  // written into it too; leaving the old value here drew a blank pill.
  data: { ...q, status: statusOf(q) },
}));

const post = async (table, body, conflict) => {
  const r = await api(`/rest/v1/${table}?on_conflict=${conflict}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
};

if (payload.length) await post("quotes", payload, "id");
await post("settings", [{ owner, data: settings ?? {}, draft: draft ?? {} }], "owner");
const pairs = Object.entries(learned);
if (pairs.length) await post("learned", pairs.map(([pair, km]) => ({ owner, pair, km })), "owner,pair");

const check = await api("/rest/v1/quotes?select=quote_no,customer&order=seq").then((r) => r.json());
console.log(`\n  written. Supabase now holds ${check.length} quotes:`);
check.forEach((r) => console.log(`    ${String(r.quote_no).padEnd(9)} ${r.customer ?? ""}`));
console.log();
