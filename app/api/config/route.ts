import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Only public values. The Google key and service key are never referenced here. */
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  return NextResponse.json({
    supabase: url && anon ? { url, anonKey: anon } : null,
    country: process.env.ADDRESS_LOOKUP_COUNTRY ?? "ca",
  });
}
