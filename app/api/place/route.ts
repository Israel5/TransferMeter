import { NextRequest, NextResponse } from "next/server";
import { isHuman } from "@/lib/server/human";
import { userClient } from "@/lib/server/session";
import { apiKey, placeLocation, MapsError } from "@/lib/maps";

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
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  try {
    return NextResponse.json(await placeLocation(key, id));
  } catch (e) {
    const err = e as MapsError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
