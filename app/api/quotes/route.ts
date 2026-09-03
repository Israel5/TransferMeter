import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { createQuote, updateQuote } from "@/lib/server/store";
import type { QuoteContent } from "@/lib/types";

/* Creating a quote, and revising one.
 *
 * Creating is its own call because only the database can say what the quote is
 * called: it issues the id, and the number follows from it. Nothing here can
 * propose a number and hope it is free. */

type Body = { content?: QuoteContent; id?: number };

export async function POST(req: Request) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }

  const content = body?.content;
  if (!content || typeof content !== "object" || !Array.isArray(content.trips)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    // One write. There used to be two: the stored customer copy needed a quote
    // number that does not exist until the row does, so every save wrote, read
    // back, and wrote again. Nothing is stored for the customer now.
    if (Number.isInteger(body.id) && (body.id as number) > 0) {
      return NextResponse.json(await updateQuote(me.sb, body.id as number, content));
    }
    return NextResponse.json(await createQuote(me.sb, me.owner, content));
  } catch (e) {
    console.error("[api/quotes] POST", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
