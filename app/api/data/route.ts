import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { pull, push } from "@/lib/server/store";
import type { AppState } from "@/lib/state";

/** A rejected or expired token reads as "sign in again", never as a fault. */
const authish = (e: unknown) =>
  /jwt|token|expired|unauthor/i.test((e as Error)?.message ?? "");

export async function GET() {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    return NextResponse.json(await pull(me.sb));
  } catch (e) {
    console.error("[api/data] GET", e);
    return NextResponse.json({ error: (e as Error).message }, { status: authish(e) ? 401 : 500 });
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
    const r = await push(me.sb, me.owner, state);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("[api/data] PUT", e);
    return NextResponse.json({ error: (e as Error).message }, { status: authish(e) ? 401 : 500 });
  }
}
