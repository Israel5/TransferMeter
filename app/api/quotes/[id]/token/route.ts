import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { fetchShareToken, rotateShareToken } from "@/lib/server/store";

/** The address a customer's link carries. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ token: await fetchShareToken(me.sb, id) });
  } catch (e) {
    // The reason stays here where it can be read; the browser gets a sentence.
    console.error("[api/quotes/[id]/token]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Retire the link that was sent and issue a new one. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ token: await rotateShareToken(me.sb, id) });
  } catch (e) {
    // The reason stays here where it can be read; the browser gets a sentence.
    console.error("[api/quotes/[id]/token]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
