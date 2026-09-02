# Deploying

Two services. Vercel serves the pages and holds the Google key; Supabase holds
the data and decides who may read it.

```
Vercel     /            the app, behind a sign-in
           /quote       what a customer opens from your link
           /api/*       Google Maps proxy — the key never reaches a browser
Supabase   quotes, settings, learned + auth + row-level security
```

## What only you can do

**1. Create the Supabase project** — <https://supabase.com/dashboard>. It asks
for an organisation, a region (pick `us-east-1`, closest to Montréal) and a
database password. Those are your choices and your billing, so they can't be
made for you.

**2. Put the credentials in `.env`** (already gitignored — never commit it):

```sh
GOOGLE_MAPS_API_KEY=AIza…
ADDRESS_LOOKUP_COUNTRY=ca
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ…    # public by design; RLS is the guard

# local only, never on a host
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ…
SUPABASE_DB_URL=postgresql://…
```

Vercel needs the first four and nothing else.

**3. Vercel** — Settings → Environment Variables, the four marked deployed in
`.env.example`. The two `NEXT_PUBLIC_` ones are compiled into the browser
bundle; the Google key stays on the server.

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
