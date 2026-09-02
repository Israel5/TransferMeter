# Deploying

Two services. Vercel serves the pages and holds the Google key; Supabase holds
the data and decides who may read it.

```
Vercel     /            the app (behind a login once it is public)
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
GOOGLE_MAPS_API_KEY=AIza…            # already there
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ…               # safe to expose; RLS is what protects you
SUPABASE_SERVICE_KEY=eyJ…            # NEVER goes in a browser or a repo
SUPABASE_DB_URL=postgresql://postgres:…@db.xxxx.supabase.co:5432/postgres
```

**3. Vercel** — `vercel link`, then add the same variables under
Settings → Environment Variables. `SUPABASE_ANON_KEY` and `SUPABASE_URL` are
the only two the browser ever sees.

Note the Hobby plan forbids commercial use; this is a business tool, so it needs
Pro or a host whose free tier allows it.

## What can be done from here

Once `.env` has those values:

- run `supabase/schema.sql` against the database
- port storage from `/api/state` to Supabase
- add the login
- point `quote.html` at `quote_by_token` / `answer_quote`

```sh
psql "$SUPABASE_DB_URL" -f supabase/schema.sql
```

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
