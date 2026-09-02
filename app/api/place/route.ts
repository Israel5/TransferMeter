import { NextRequest, NextResponse } from "next/server";
import { apiKey, placeLocation, MapsError } from "@/lib/maps";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
