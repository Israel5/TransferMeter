import { NextResponse } from "next/server";
import { anonClient, writeSession } from "@/lib/server/session";

/* Signing in happens here, so the password is posted to our own origin and the
   tokens it returns never enter the page. */
export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Email and password, please." }, { status: 400 });

  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    // Never say which half was wrong: that tells a stranger which emails exist.
    return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  }

  await writeSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  });
  return NextResponse.json({ ok: true });
}
