import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";
import { exportAll, importAll, type Backup } from "@/lib/server/store";

/** Download everything. */
export async function GET() {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const data = await exportAll(me.sb);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        // Never cached or stored by anything in between: this is every
        // customer's name, address and telephone number in one file.
        "cache-control": "no-store, private",
      },
    });
  } catch (e) {
    console.error("[api/backup] GET", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Put one back. Adds and overwrites; never deletes. */
export async function POST(req: Request) {
  const me = await userClient();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Backup;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "That file is not readable JSON." }, { status: 400 }); }

  try {
    return NextResponse.json({ ok: true, ...(await importAll(me.sb, me.owner, body)) });
  } catch (e) {
    console.error("[api/backup] POST", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
