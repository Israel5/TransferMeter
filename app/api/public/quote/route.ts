import { NextResponse } from "next/server";
import { anonClient } from "@/lib/server/session";
import { customerPayload } from "@/lib/message";
import { waDigits } from "@/lib/whatsapp";
import { DEFAULTS } from "@/lib/types";
import type { Quote, QuoteContent, Settings } from "@/lib/types";

/* The customer's page, served without a key of any kind reaching their browser.
   Each of these calls a database function that guards itself: the token has to
   match, the quote has to be in a state that permits the action, and the
   counts are checked key by key. This route adds no privilege -- it only means
   the browser never has to hold one. */

type Opened = {
  quote: QuoteContent & { savedAt?: string };
  id: number; quoteNo: string; status: string; answered_at: string | null;
  settings: Partial<Settings>;
};

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token) return NextResponse.json({ error: "No quote in that link." }, { status: 400 });

  const { data, error } = await anonClient().rpc("quote_by_token", { token });
  if (error) return NextResponse.json({ error: "That link could not be opened." }, { status: 400 });
  if (!data) return NextResponse.json({ error: "No quote in that link." }, { status: 404 });

  // Shaped here, from the quote as it stands right now. It used to be shaped
  // when the quote was saved and stored beside it, so a link already in a
  // customer's hands kept showing the price it had at that moment.
  const row = data as Opened;
  const settings = { ...DEFAULTS, ...(row.settings ?? {}) } as Settings;
  const quote = {
    ...row.quote,
    id: row.id,
    quoteNo: row.quoteNo ?? "",
    status: row.status,
    savedAt: row.quote?.savedAt ?? "",
  } as Quote;

  return NextResponse.json({
    ...customerPayload(quote, settings, (v: string) => waDigits(v, settings)),
    status: row.status,
    answered_at: row.answered_at,
  });
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
