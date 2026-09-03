import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { createQuote, updateQuote } from "@/lib/server/store";
import { customerPayload } from "@/lib/message";
import { waDigits } from "@/lib/whatsapp";
import type { QuoteContent, Settings } from "@/lib/types";

/* Creating a quote, and revising one.
 *
 * Creating is its own call because only the database can say what the quote is
 * called: it issues the id, and the number follows from it. Nothing here can
 * propose a number and hope it is free. */

type Body = { content?: QuoteContent; settings?: Settings; id?: number };

export async function POST(req: Request) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const content = body?.content;
  const settings = body?.settings;
  if (!content || typeof content !== "object" || !Array.isArray(content.trips) || !settings) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const view = (q: Parameters<typeof customerPayload>[0]) =>
      customerPayload(q, settings, (v: string) => waDigits(v, settings));

    if (Number.isInteger(body.id) && (body.id as number) > 0) {
      const saved = await updateQuote(me.sb, body.id as number, content);
      return NextResponse.json(await updateQuote(me.sb, saved.id, content, view(saved)));
    }

    const created = await createQuote(me.sb, me.owner, content);
    // The customer's copy needs the number, which only exists once the row does.
    return NextResponse.json(await updateQuote(me.sb, created.id, content, view(created)));
  } catch (e) {
    console.error("[api/quotes] POST", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
