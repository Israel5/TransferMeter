// Fill in what a customer may see, for quotes saved before the column existed.
//
//   node scripts/backfill-customer-view.mjs            # dry run
//   node scripts/backfill-customer-view.mjs --write
//
// Builds it with the same code the app uses, so there is one definition of
// what a customer is shown rather than a second one written in SQL.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// The library is compiled to CommonJS for this script; load it as such rather
// than maintaining a second build just for a one-off backfill.
const req = createRequire(import.meta.url);
const { customerPayload } = req("../.build/message.js");
const { DEFAULTS } = req("../.build/types.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

function env() {
  const out = {};
  const f = join(ROOT, ".env");
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return { ...out, ...process.env };
}
const E = env();
const api = (path, opts = {}) =>
  fetch(E.SUPABASE_URL + path, {
    ...opts,
    headers: {
      apikey: E.SUPABASE_SERVICE_KEY,
      Authorization: "Bearer " + E.SUPABASE_SERVICE_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

const settingsRows = await api("/rest/v1/settings?select=data&limit=1").then((r) => r.json());
const S = { ...DEFAULTS, ...(settingsRows?.[0]?.data ?? {}) };

const rows = await api("/rest/v1/quotes?select=id,quote_no,customer,data,customer_view&order=seq").then((r) => r.json());

// Same rule the app uses for turning a contact into a number.
const digits = (v) => String(v ?? "").replace(/\D/g, "");

let changed = 0;
for (const row of rows) {
  const view = customerPayload(row.data, S, digits);
  const same = JSON.stringify(row.customer_view ?? null) === JSON.stringify(view);
  const stops = (view.t ?? []).flatMap((t) => t.s).join(" -> ");
  console.log(`  ${String(row.quote_no).padEnd(9)} ${same ? "unchanged" : "update   "}  ${stops.slice(0, 70)}`);
  if (same) continue;
  changed++;
  if (WRITE) {
    const r = await api(`/rest/v1/quotes?id=eq.${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ customer_view: view }),
    });
    if (!r.ok) { console.error("   failed:", await r.text()); process.exit(1); }
  }
}
console.log(`\n  ${changed} to update. ${WRITE ? "Written." : "Dry run — add --write."}\n`);
