# Transfer Meter

Quoting for airport transfers: routes and fuel from Google, price bands,
per-leg tips and payment, a booking calendar, earnings, and a designed PDF
quote. Built with Next.js.

```sh
npm install
npm run dev          # http://localhost:3001
```

## What it does

- **Trips** — every quote, searchable, with status, what's owed and what was tipped
- **Editor** — a route of any shape, with address autocomplete and live distances
- **Two legs** — the drop-off now and the pickup days later, each with its own
  date, pick-up time and route; they don't have to mirror each other
- **Pick-up time** works backwards to when you must leave, and asks Google for
  traffic at that hour rather than right now
- **Calendar** — the month's bookings and what each one earned
- **PDF and WhatsApp** — the same quote in PT, EN or FR
- **Customer page** at `/quote` — the whole quote travels inside the link, so
  that page stores nothing and is safe to share

## Distances

Highest precedence first:

1. **A number you typed** — remembered for that pair of places, both directions
2. **Google**, when the API key is configured
3. **An estimate** — straight-line × road factor, a ballpark within 10–15%

## Privacy

Your own address is never drawn on screen or sent to a customer. The route says
*Starting point* and *End point*; the address lives in settings and goes to
Google only so distances are right. The PDF, the message and the customer link
all carry the customer's journey alone — no home address, no fuel cost, no tip,
no notes.

## Layout

```
app/           pages and API routes
  api/         Maps proxy and public config; the key stays on the server
  quote/       what a customer opens from a link
components/    the interface
lib/           types, places, calculations, PDF, messages, Supabase
supabase/      schema, row-level security, customer functions
```

`lib/quote.ts` holds every calculation and touches no DOM, so the numbers can be
tested on their own.

## Environment

Copy `.env.example` to `.env`. Only `GOOGLE_MAPS_API_KEY` is needed to run;
adding `SUPABASE_URL` and `SUPABASE_ANON_KEY` turns on sign-in and shared
storage. Without them the app keeps everything in the browser.

The Google key and the Supabase service key are read only on the server and are
never sent to a browser.
