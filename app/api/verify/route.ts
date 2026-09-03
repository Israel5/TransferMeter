import { NextResponse } from "next/server";
import { markHuman } from "@/lib/server/human";

/* One challenge, answered once, at the start.
 *
 * Cloudflare's token is single use, so it is spent here and exchanged for a
 * short-lived cookie. Everything the form needs afterwards -- looking up an
 * address, and sending the request -- trusts that cookie instead of asking
 * again. */

const VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function POST(req: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.QUOTE_REQUEST_SECRET) {
    return NextResponse.json({ error: "This site is not set up to take requests yet." }, { status: 503 });
  }

  let body: { token?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Please complete the verification." }, { status: 400 });

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) form.append("remoteip", ip);

  let ok = false;
  try {
    const r = await fetch(VERIFY, { method: "POST", body: form });
    ok = !!(await r.json())?.success;
  } catch {
    return NextResponse.json({ error: "Could not verify that just now. Please try again." }, { status: 502 });
  }
  if (!ok) return NextResponse.json({ error: "That verification did not pass." }, { status: 403 });

  await markHuman();
  return NextResponse.json({ ok: true });
}
