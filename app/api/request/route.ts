import { NextResponse } from "next/server";

/* The only way a stranger's request reaches the database.
 *
 * Two gates, and both are here on the server because neither can be trusted to
 * a browser. Turnstile says a person filled the form in; the shared secret says
 * the request came through this route rather than straight at the database's
 * API, which is reachable from anywhere. The database then decides what may
 * actually be stored -- see request_quote, which keeps named fields only.
 */

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function POST(req: Request) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const formSecret = process.env.QUOTE_REQUEST_SECRET;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;

  // Fail closed, but never silently: the log says which one is absent, because
  // "not set up yet" on a site you believe you configured is a dead end.
  const missing = [
    !url && "SUPABASE_URL",
    !anon && "SUPABASE_ANON_KEY",
    !formSecret && "QUOTE_REQUEST_SECRET",
    !turnstileSecret && "TURNSTILE_SECRET_KEY",
  ].filter(Boolean);
  if (missing.length || !url || !anon || !formSecret || !turnstileSecret) {
    console.error("[api/request] refusing: missing", missing.join(", "),
                  "-- env changes need a redeploy to reach a running function");
    return NextResponse.json({ error: "This site is not set up to take requests yet." }, { status: 503 });
  }

  let body: { payload?: unknown; token?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) {
    return NextResponse.json({ error: "Please complete the verification." }, { status: 400 });
  }

  const form = new FormData();
  form.append("secret", turnstileSecret);
  form.append("response", token);
  // Cloudflare uses this to spot one address firing many challenges.
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) form.append("remoteip", ip);

  let human = false;
  try {
    const r = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
    human = !!(await r.json())?.success;
  } catch {
    return NextResponse.json({ error: "Could not verify that just now. Please try again." }, { status: 502 });
  }
  if (!human) {
    return NextResponse.json({ error: "That verification did not pass. Please try again." }, { status: 403 });
  }

  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  const rpc = await fetch(`${url}/rest/v1/rpc/request_quote`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" },
    body: JSON.stringify({ payload, secret: formSecret }),
  });

  if (!rpc.ok) {
    // The database's own words are safe to pass on: they are about the shape of
    // the request, never about what is stored.
    const said = await rpc.json().catch(() => null);
    const message = typeof said?.message === "string" ? said.message : "That request could not be sent.";
    return NextResponse.json({ error: message }, { status: rpc.status === 429 ? 429 : 400 });
  }

  const shareToken = await rpc.json().catch(() => null);
  return NextResponse.json({ ok: true, token: typeof shareToken === "string" ? shareToken : null });
}
