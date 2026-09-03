# Deploying

Two services. Vercel serves the pages and holds the Google key; Supabase holds
the data and decides who may read it.

```
Vercel     /today /trips /calendar /settings   the app, behind a sign-in
           /quote/<token>                      what a customer opens
           /request                            where a customer asks for one
           /api/*                              everything that talks outward
Supabase   quotes, settings, learned + auth + row-level security
```

No key of any kind reaches a browser. The pages call this site's own `/api`
routes; those routes call Google and Supabase. The session is an httpOnly
cookie, so no script on the page can read it either.

## What only you can do

**1. Create the Supabase project** — <https://supabase.com/dashboard>. It asks
for an organisation, a region (pick `us-east-1`, closest to Montréal) and a
database password. Those are your choices and your billing, so they can't be
made for you.

**2. Create a Turnstile widget** — <https://dash.cloudflare.com> → Turnstile.
Add every hostname you will use it on, **including `localhost`**: without it
the sign-in and the request form both stop at a challenge that never passes.

**3. Put the credentials in `.env`** (already gitignored — never commit it):

```sh
# read by the deployed app, all server-side
GOOGLE_MAPS_API_KEY=AIza…
ADDRESS_LOOKUP_COUNTRY=ca
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ…
TURNSTILE_SECRET_KEY=0x4…
QUOTE_REQUEST_SECRET=…          # from config.request_secret in the database

# the one value that belongs in the page, which is what a site key is for
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4…

# local only, never on a host: migrations and scripts/set-password.mjs
SUPABASE_SERVICE_KEY=eyJ…
SUPABASE_DB_URL=postgresql://…
```

**4. Vercel** — Settings → Environment Variables, the seven above the local-only
line. Then redeploy: a running function does not see an environment change
until the next build, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is compiled in.

Note the Hobby plan forbids commercial use; this is a business tool, so it needs
Pro or a host whose free tier allows it.

## The database

One file holds all of it — tables, row-level security, and the three functions
a customer's link is allowed to call. It is safe to re-run.

```sh
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```


## Signing in

The app uses a password, not an emailed link, so nothing about logging in shows
the customer or the driver who hosts the database.

To set or change it:

```sh
node scripts/set-password.mjs
```

It prompts on your machine with the input hidden and writes it through the admin
API. Nothing is emailed and the service key never leaves your laptop.

## Local development

```sh
npm install
npm run dev          # http://localhost:3001
```

The port is set in the npm scripts, not in `.env` — an inherited `PORT` there
once made Next take over 8787 and knock out the old server.

The single-file app and its SQLite server live on the `main` branch if you need
to look back at them.

## Before the app goes public

It has no login today, because it only ever ran on your Mac. On a public URL,
anyone with the address would see every quote, every phone number and your
earnings. Supabase Auth plus the policies in `supabase/schema.sql` close that,
and it must land before the first deploy — not after.
