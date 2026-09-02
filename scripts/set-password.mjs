// Set the owner's password, from your own machine.
//
//   node scripts/set-password.mjs
//
// Prompts with the input hidden, then sets it through Supabase's admin API
// using the service key from .env. Nothing is emailed, nothing is echoed, and
// the service key never leaves this machine.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
if (!E.SUPABASE_URL || !E.SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be in .env");
  process.exit(1);
}

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

const list = await api("/auth/v1/admin/users?per_page=2").then((r) => r.json());
const user = list?.users?.[0];
if (!user) {
  console.error("No account exists yet.");
  process.exit(1);
}

/** Read a line while showing asterisks instead of the characters. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (s.trim().length) rl.output.write("*");
    };
    rl.question(question, (value) => {
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
    muted = true;
  });
}

console.log("\n  Setting the password for " + user.email + "\n");

const pw = await askHidden("  New password: ");
if (pw.length < 8) {
  console.error("\n  Too short - use at least 8 characters.\n");
  process.exit(1);
}
const again = await askHidden("  Again:        ");
if (pw !== again) {
  console.error("\n  Those do not match.\n");
  process.exit(1);
}

const r = await api("/auth/v1/admin/users/" + user.id, {
  method: "PUT",
  body: JSON.stringify({ password: pw }),
});
if (!r.ok) {
  console.error("\n  Failed: " + (await r.text()) + "\n");
  process.exit(1);
}

console.log("\n  Done. Sign in as " + user.email + " with that password.\n");
