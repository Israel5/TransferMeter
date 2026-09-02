import { NextResponse } from "next/server";
import { anonClient } from "@/lib/server/session";

/* The customer's page, served without a key of any kind reaching their browser.
   Each of these calls a database function that guards itself: the token has to
   match, the quote has to be in a state that permits the action, and the
   counts are checked key by key. This route adds no privilege -- it only means
   the browser never has to hold one. */

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token) return NextResponse.json({ error: "No quote in that link." }, { status: 400 });
  const { data, error } = await anonClient().rpc("quote_by_token", { token });
  if (error) return NextResponse.json({ error: "That link could not be opened." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No quote in that link." }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  let body: { token?: unknown; answer?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  const answer = body.answer === "approved" || body.answer === "declined" ? body.answer : "";
  if (!token || !answer) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  const { data, error } = await anonClient().rpc("answer_quote", { token, answer });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request) {
  let body: { token?: unknown; counts?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }
  const token = typeof body.token === "string" ? body.token : "";
  const counts = body.counts && typeof body.counts === "object" ? body.counts : null;
  if (!token || !counts) return NextResponse.json({ error: "Malformed request." }, { status: 400 });

  const { data, error } = await anonClient().rpc("update_quote_counts", { token, counts });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
