import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { setQuoteStatus } from "@/lib/server/store";

const ALLOWED = ["draft", "requested", "sent", "approved", "declined"];

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Unknown quote." }, { status: 400 });
  }

  let body: { status?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }
  const status = typeof body.status === "string" ? body.status : "";
  if (!ALLOWED.includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });

  try {
    await setQuoteStatus(me.sb, id, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // The reason stays here where it can be read; the browser gets a sentence.
    console.error("[api/quotes/[id]/status]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
