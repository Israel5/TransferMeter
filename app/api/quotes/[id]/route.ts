import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { removeQuote } from "@/lib/server/store";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  try {
    // Row-level security is what stops this touching anyone else's quote; the
    // id in the address is not trusted on its own.
    await removeQuote(me.sb, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // The reason stays here where it can be read; the browser gets a sentence.
    console.error("[api/quotes/[id]]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
