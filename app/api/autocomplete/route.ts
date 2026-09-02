import { NextRequest, NextResponse } from "next/server";
import { apiKey, autocomplete, MapsError } from "@/lib/maps";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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
