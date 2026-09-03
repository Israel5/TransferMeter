import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/* Proof that a browser passed the Turnstile challenge, good for a short while.
 *
 * Address lookup costs money on every keystroke, so it cannot be left open to
 * anyone who finds the endpoint. Nor can it be paid for by the challenge at the
 * bottom of the form: by the time that is answered the searching is over.
 *
 * So the challenge is answered once, up front, and exchanged for this. It is
 * signed with a secret the browser never sees, carries its own expiry, and is
 * httpOnly, so a page cannot read it, copy it, or extend it.
 */

const COOKIE = "tm_human";
const GOOD_FOR = 30 * 60 * 1000;   // half an hour: long enough to fill a form in

function secret() {
  const s = process.env.QUOTE_REQUEST_SECRET;
  if (!s) throw new Error("QUOTE_REQUEST_SECRET is not set");
  return s;
}

const sign = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

/** Mint the proof. Called only after Cloudflare has said yes. */
export async function markHuman() {
  const expires = Date.now() + GOOD_FOR;
  const payload = String(expires);
  const value = `${payload}.${sign(payload)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(GOOD_FOR / 1000),
  });
}

/** Whether this browser has passed a challenge recently. */
export async function isHuman(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [payload, given] = raw.split(".");
  if (!payload || !given) return false;

  // Compare in constant time: a signature check that leaks how much of it was
  // right is a signature check that can be guessed one character at a time.
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(given);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && expires > Date.now();
}
