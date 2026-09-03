import { NextRequest, NextResponse } from "next/server";
import { isHuman } from "@/lib/server/human";
import { userClient } from "@/lib/server/session";
import { apiKey, autocomplete, MapsError } from "@/lib/maps";

export const dynamic = "force-dynamic";

/** Google charges for these, so they are not open to whoever finds them: the
 *  driver, signed in, or a browser that has just passed a challenge. */
async function allowed() {
  if (await isHuman()) return true;
  return !!(await userClient());
}


export async function GET(req: NextRequest) {
  if (!(await allowed())) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const key = apiKey();
  if (!key) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not set" }, { status: 500 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });
  try {
    const results = await autocomplete(key, q, process.env.ADDRESS_LOOKUP_COUNTRY ?? "ca");
    return NextResponse.json({ results });
  } catch (e) {
    const err = e as MapsError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
