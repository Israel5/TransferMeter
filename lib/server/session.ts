import { cookies } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* The session, kept where a script cannot read it.
 *
 * The tokens live in an httpOnly cookie rather than localStorage, so no code
 * running in the page -- including anything that ever manages to inject itself
 * into it -- can read them or send them anywhere. The browser attaches the
 * cookie, the server takes the tokens out of it, and the page itself never
 * holds a credential of any kind.
 *
 * The client built here carries the signed-in user's own token, so row-level
 * security applies exactly as before. No service key is used anywhere in the
 * deployed app: if this code has a hole, it still cannot read another owner's
 * rows, because the database is still the one deciding.
 */

const COOKIE = "tm_session";

type Stored = { access_token: string; refresh_token: string; expires_at: number };

function config() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("The server is missing its database settings.");
  return { url, anon };
}

/** A client with no user attached: for the token-addressed customer functions,
 *  which are reachable without signing in and guard themselves. */
export function anonClient(): SupabaseClient {
  const { url, anon } = config();
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readSession(): Promise<Stored | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Stored;
    return s?.access_token && s?.refresh_token ? s : null;
  } catch { return null; }
}

export async function writeSession(s: Stored) {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(s)).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** The signed-in user's client, refreshing the token when it has aged out.
 *  Returns null when nobody is signed in, which every route treats as a 401. */
export async function userClient(): Promise<{ sb: SupabaseClient; owner: string } | null> {
  const stored = await readSession();
  if (!stored) return null;
  const { url, anon } = config();

  const build = (token: string) =>
    createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

  // A minute of slack, so a token does not expire midway through a request.
  const fresh = stored.expires_at * 1000 > Date.now() + 60_000;
  if (fresh) {
    const sb = build(stored.access_token);
    const { data } = await sb.auth.getUser(stored.access_token);
    if (data?.user) return { sb, owner: data.user.id };
  }

  const plain = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await plain.auth.refreshSession({ refresh_token: stored.refresh_token });
  if (error || !data.session || !data.user) { await clearSession(); return null; }

  await writeSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  });
  return { sb: build(data.session.access_token), owner: data.user.id };
}
