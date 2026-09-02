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
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
      else if (s.trim().length) rl.output.write("*");
    };
    rl.on("close", () => reject(new Error("input closed")));
    rl.question(question, (value) => {
      rl.removeAllListeners("close");
      rl.close();
      process.stdout.write("\n");
      resolve(value);
    });
    muted = true;
  });
}

/** Everything piped in, when there is no terminal to prompt on. */
function readPiped() {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { buf += d; });
    process.stdin.on("end", () => resolve(buf.trim()));
  });
}

const DRY = process.argv.includes("--dry-run");
let pw;

if (process.stdin.isTTY) {
  console.log("\n  Setting the password for " + user.email + "\n");
  pw = await askHidden("  New password: ");
  const again = await askHidden("  Again:        ");
  if (pw !== again) {
    console.error("\n  Those do not match.\n");
    process.exit(1);
  }
} else {
  // No terminal: take it from a pipe, so it never lands in shell history.
  pw = await readPiped();
  if (!pw) {
    console.error(
      "\n  No terminal to prompt on, and nothing piped in.\n" +
      "\n  Run it in Terminal.app:      node scripts/set-password.mjs" +
      "\n  or pipe without history:     read -s PW && printf %s \"$PW\" | node scripts/set-password.mjs\n",
    );
    process.exit(1);
  }
  console.log("\n  Setting the password for " + user.email);
}

if (pw.length < 8) {
  console.error("\n  Too short - use at least 8 characters.\n");
  process.exit(1);
}

if (DRY) {
  console.log("\n  Dry run: read a password of " + pw.length + " characters. Nothing was written.\n");
  process.exit(0);
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
