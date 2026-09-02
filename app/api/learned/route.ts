import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { clearLearned } from "@/lib/server/store";

export async function DELETE() {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    await clearLearned(me.sb, me.owner);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
