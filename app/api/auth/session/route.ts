import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/session";

/** Whether this browser is signed in. Says nothing else about the account. */
export async function GET() {
  const me = await userClient();
  return NextResponse.json({ signedIn: !!me });
}
