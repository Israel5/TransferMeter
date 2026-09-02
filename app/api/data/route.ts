import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { pull, push } from "@/lib/server/store";
import { customerPayload } from "@/lib/message";
import { waDigits } from "@/lib/whatsapp";
import type { AppState } from "@/lib/state";

export async function GET() {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    return NextResponse.json(await pull(me.sb));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let state: AppState;
  try { state = await req.json(); } catch { return NextResponse.json({ error: "Malformed request." }, { status: 400 }); }
  if (!state || typeof state !== "object" || !Array.isArray(state.quotes)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  try {
    const adopted = await push(me.sb, me.owner, state, (q) =>
      customerPayload(q, state.settings, (v: string) => waDigits(v, state.settings)));
    return NextResponse.json({ ok: true, adopted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
