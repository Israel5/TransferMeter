import { NextRequest, NextResponse } from "next/server";
import { apiKey, route, MapsError } from "@/lib/maps";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const key = apiKey();
  if (!key) return NextResponse.json({ error: "GOOGLE_MAPS_API_KEY is not set" }, { status: 500 });
  try {
    const body = await req.json();
    return NextResponse.json(await route(key, body.stops ?? [], body.departureTime));
  } catch (e) {
    const err = e as MapsError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
