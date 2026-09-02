-- Transfer Meter — Supabase schema
--
-- Two audiences with very different rights:
--   you        signed in, own every row, full access
--   a customer not signed in, holds only a link, may read ONE quote and
--              answer it — nothing else
--
-- The customer never touches these tables directly. Access is revoked and
-- given back through two security-definer functions that take the link's
-- token, so the boundary is enforced by Postgres rather than by client code.

-- ---------------------------------------------------------------- quotes ---
create table if not exists public.quotes (
  seq          bigint generated always as identity,
  id           text primary key,                    -- minted by the page, works offline
  owner        uuid not null references auth.users(id) on delete cascade,
  quote_no     text,
  customer     text,
  contact      text,
  notes        text,
  -- Where the quote came from, and who is waiting on whom:
  --   draft      you saved it, not sent yet          → you
  --   requested  the customer asked for it           → you
  --   sent       you sent it, awaiting their answer  → them
  --   approved   they accepted
  --   declined   they said no, or you turned down a request
  origin       text not null default 'driver'
                 check (origin in ('driver','customer')),
  status       text not null default 'draft'
                 check (status in ('draft','requested','sent','approved','declined')),
  first_date   date,                                -- earliest leg, for the calendar
  price        numeric not null default 0,
  tip          numeric not null default 0,
  cost         numeric not null default 0,
  total_km     numeric not null default 0,
  data         jsonb  not null,                     -- the full snapshot, unchanged
  share_token  text not null unique
                 default replace(gen_random_uuid()::text, '-', ''),
  customer_view jsonb,          -- what the customer is shown, decided by the app
  answered_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (owner, quote_no)
);

create index if not exists quotes_owner_date on public.quotes (owner, first_date desc);
create index if not exists quotes_owner_status on public.quotes (owner, status);

-- Who new customer requests belong to. One driver, one row.
create table if not exists public.config (
  id    boolean primary key default true check (id),
  owner uuid not null references auth.users(id) on delete cascade
);

-- Shared with the request form's server route and nothing else. It is not a
-- privilege: it only proves a request came through the route that checked
-- Turnstile, rather than straight at the API with the public key everyone has.
alter table public.config add column if not exists request_secret text;
update public.config
   set request_secret = encode(gen_random_bytes(24), 'hex')
 where request_secret is null;
alter table public.config enable row level security;
drop policy if exists "owner reads config" on public.config;
create policy "owner reads config" on public.config
  for select using (auth.uid() = owner);

-- --------------------------------------------------- settings & distances ---
create table if not exists public.settings (
  owner      uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,     -- car, fuel, bands, your details
  draft      jsonb not null default '{}'::jsonb,     -- the trip open in the editor
  updated_at timestamptz not null default now()
);

create table if not exists public.learned (
  owner uuid not null references auth.users(id) on delete cascade,
  pair  text not null,                               -- "place a|place b", sorted
  km    numeric not null,
  primary key (owner, pair)
);

-- ------------------------------------------------------------------- rls ---
alter table public.quotes   enable row level security;
alter table public.settings enable row level security;
alter table public.learned  enable row level security;

-- You, signed in, own your rows and nothing else.
drop policy if exists "owner reads own quotes" on public.quotes;
create policy "owner reads own quotes" on public.quotes
  for select using (auth.uid() = owner);
drop policy if exists "owner writes own quotes" on public.quotes;
create policy "owner writes own quotes" on public.quotes
  for insert with check (auth.uid() = owner);
drop policy if exists "owner updates own quotes" on public.quotes;
create policy "owner updates own quotes" on public.quotes
  for update using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "owner deletes own quotes" on public.quotes;
create policy "owner deletes own quotes" on public.quotes
  for delete using (auth.uid() = owner);

drop policy if exists "owner owns settings" on public.settings;
create policy "owner owns settings" on public.settings
  for all using (auth.uid() = owner) with check (auth.uid() = owner);
drop policy if exists "owner owns learned" on public.learned;
create policy "owner owns learned" on public.learned
  for all using (auth.uid() = owner) with check (auth.uid() = owner);

-- Anonymous visitors get no table access at all.
-- Supabase grants anon full table privileges by default; take them all back.
-- RLS would still refuse, but the grant should not be there to begin with.
revoke all on public.quotes, public.settings, public.learned, public.config from anon;
revoke all on all tables in schema public from anon;

-- ------------------------------------------------- customer asks for one ---
-- A stranger may create a request and nothing else. They cannot choose the
-- price, the status, or whose books it lands in — this function decides all
-- three. What comes back is only the token for following their own request.
drop function if exists public.request_quote(jsonb);
create or replace function public.request_quote(payload jsonb, secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id    text := 'r' || left(replace(gen_random_uuid()::text, '-', ''), 16);
  the_owner uuid;
  recent    int;
  clean     jsonb;
  want      text;
begin
  select owner, request_secret into the_owner, want from public.config where id;
  if the_owner is null then raise exception 'no driver configured'; end if;

  -- Anyone can read the anon key out of the page, so the key alone cannot say
  -- where a request came from. This can: only the server route that verified
  -- the Turnstile token knows it.
  if want is null or secret is distinct from want then
    raise exception 'that request did not come from the form';
  end if;

  -- Cheap flood guard: a burst of requests in one minute is not a person.
  select count(*) into recent
    from public.quotes
   where origin = 'customer' and created_at > now() - interval '1 minute';
  if recent >= 5 then raise exception 'too many requests, try again shortly'; end if;

  if coalesce(trim(payload->>'customer'), '') = '' then
    raise exception 'a name is required';
  end if;

  -- Never store the caller's object as it arrives. Whatever the request form
  -- grows into, this is the whole list of what a stranger may put in the
  -- record: no id to collide with a real quote, no quote number, no status,
  -- no token, no owner, and nothing unbounded.
  if length(payload::text) > 8000 then
    raise exception 'that request is too large';
  end if;

  clean := jsonb_build_object(
    'customer', left(trim(payload->>'customer'), 120),
    'contact',  left(coalesce(trim(payload->>'contact'), ''), 60),
    'notes',    left(coalesce(trim(payload->>'note'), ''), 1000),
    'lang',     case when payload->>'lang' in ('pt','en','fr')
                     then payload->>'lang' else 'pt' end,
    'origin',   'customer',
    'trips',    coalesce(jsonb_path_query_first(payload, '$.trips ? (@.type() == "array")'),
                         '[]'::jsonb),
    'pax',      coalesce(jsonb_path_query_first(payload, '$.pax  ? (@.type() == "object")'), '{}'::jsonb),
    'gear',     coalesce(jsonb_path_query_first(payload, '$.gear ? (@.type() == "object")'), '{}'::jsonb),
    'bags',     coalesce(jsonb_path_query_first(payload, '$.bags ? (@.type() == "object")'), '{}'::jsonb)
  );

  if jsonb_array_length(clean -> 'trips') > 4 then
    raise exception 'too many legs in that request';
  end if;

  insert into public.quotes (id, owner, origin, status, customer, contact,
                             first_date, price, data)
  values (new_id, the_owner, 'customer', 'requested',
          clean->>'customer',
          clean->>'contact',
          nullif(payload->>'first_date','')::date,
          -- the estimate the page showed them; you confirm or change it,
          -- and it cannot be negative or absurd
          least(greatest(coalesce((payload->>'estimate')::numeric, 0), 0), 100000),
          clean);

  return (select share_token from public.quotes where id = new_id);
end $$;

revoke all on function public.request_quote(jsonb, text) from public;
grant execute on function public.request_quote(jsonb, text) to anon, authenticated;

-- --------------------------------------------------------------- touch ------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();


-- Self-provisioning, then closed.
--
-- The first account created becomes the owner and is written into config, and
-- every attempt after it is refused. Nobody who finds the site can register,
-- whether the account is made here or in the dashboard.

create or replace function public.claim_first_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare existing int;
begin
  select count(*) into existing from auth.users where id <> new.id;

  if existing > 0 then
    raise exception 'This installation already has an owner.'
      using errcode = '42501';
  end if;

  -- The first account owns the data, and customer requests land in its books.
  insert into public.config (id, owner) values (true, new.id)
    on conflict (id) do update set owner = excluded.owner;

  return new;
end $$;

drop trigger if exists claim_first_account on auth.users;
create trigger claim_first_account
  after insert on auth.users
  for each row execute function public.claim_first_account();


-- Let a customer read and answer their own quote, with no table access.
--
-- What they may see is decided by the application when it saves, and stored in
-- customer_view: their legs, their totals, the driver's name. Never the home
-- address, the fuel cost, the tip or the notes. The database just serves that
-- column, so there is one place where the rule lives.

create or replace function public.quote_by_token(token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q public.quotes%rowtype;
begin
  select * into q from public.quotes where share_token = token;
  if not found then return null; end if;

  -- A draft has not been sent to anyone; it should not be readable yet.
  if q.status = 'draft' then return null; end if;

  return coalesce(q.customer_view, '{}'::jsonb)
       || jsonb_build_object('status', q.status, 'answered_at', q.answered_at);
end $$;

drop function if exists public.answer_quote(text, text);
create function public.answer_quote(token text, answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare q public.quotes%rowtype;
begin
  if answer not in ('approved','declined') then
    raise exception 'answer must be approved or declined';
  end if;

  -- The status lives in this column and nowhere else. It used to be copied
  -- into data as well, the two drifted, and an answer that reached only one of
  -- them was either invisible or silently overwritten. The driver's app reads
  -- this column now, and its saves do not carry a status at all.
  update public.quotes
     set status      = answer,
         answered_at = now(),
         updated_at  = now()
   where share_token = token
     and status in ('sent','approved','declined')   -- never a draft or a request
  returning * into q;

  if not found then raise exception 'that quote is not awaiting an answer'; end if;

  return jsonb_build_object('status', q.status, 'answered_at', q.answered_at);
end $$;

revoke all on function public.quote_by_token(text) from public;
revoke all on function public.answer_quote(text, text) from public;
grant execute on function public.quote_by_token(text) to anon, authenticated;
grant execute on function public.answer_quote(text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- A customer correcting their own details.
--
-- They know how many of them there are and what they are carrying better than
-- the driver guessing on the phone, so the link lets them fix it. Deliberately
-- narrow: counts only, on a quote that is still awaiting an answer, and every
-- key and value checked here rather than trusted from the browser. Nothing
-- about price, dates, addresses or status can be reached through it.
-- ---------------------------------------------------------------------------
create or replace function public.update_quote_counts(token text, counts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q      public.quotes%rowtype;
  clean  jsonb := '{}'::jsonb;
  grp    text;
  key    text;
  val    numeric;
  allowed constant jsonb := jsonb_build_object(
    'pax',  jsonb_build_array('adults','children','infants'),
    'gear', jsonb_build_array('infantSeat','carSeat','booster'),
    'bags', jsonb_build_array('checked','carry','backpack','stroller','crib','other')
  );
begin
  if jsonb_typeof(counts) is distinct from 'object' then
    raise exception 'counts must be an object';
  end if;

  -- Keep only keys this function recognises, as whole numbers within reach of
  -- a car. Anything else is dropped rather than argued with.
  for grp in select jsonb_object_keys(allowed) loop
    if counts ? grp then
      if jsonb_typeof(counts -> grp) is distinct from 'object' then
        raise exception '% must be an object', grp;
      end if;
      -- jsonb_set only ever creates the final key, so the group object has to
      -- exist before a value can be written inside it. Without this the writes
      -- vanish and the update looks like it worked.
      if not (clean ? grp) then
        clean := clean || jsonb_build_object(grp, '{}'::jsonb);
      end if;
      for key in select jsonb_array_elements_text(allowed -> grp) loop
        if (counts -> grp) ? key then
          begin
            val := (counts -> grp ->> key)::numeric;
          exception when others then
            raise exception 'bad value for %.%', grp, key;
          end;
          if val < 0 or val > 20 or val <> floor(val) then
            raise exception 'bad value for %.%', grp, key;
          end if;
          clean := jsonb_set(clean, array[grp, key], to_jsonb(floor(val)::int), true);
        end if;
      end loop;
    end if;
  end loop;

  update public.quotes
     set data = data
              || jsonb_build_object(
                   'pax',  coalesce(nullif(clean -> 'pax',  '{}'::jsonb), data -> 'pax'),
                   'gear', coalesce(nullif(clean -> 'gear', '{}'::jsonb), data -> 'gear'),
                   'bags', coalesce(nullif(clean -> 'bags', '{}'::jsonb), data -> 'bags'),
                   'customerEditedAt', to_jsonb(now())
                 ),
         -- The customer's copy has to agree with what they just typed.
         customer_view = coalesce(customer_view, '{}'::jsonb)
              || jsonb_build_object('xc', coalesce(customer_view -> 'xc', '{}'::jsonb) || clean),
         updated_at = now()
   where share_token = token
     and status = 'sent'          -- only while it is still awaiting an answer
  returning * into q;

  if not found then
    raise exception 'that quote is not open for changes';
  end if;

  return jsonb_build_object('xc', q.customer_view -> 'xc');
end $$;

revoke all on function public.update_quote_counts(text, jsonb) from public;
grant execute on function public.update_quote_counts(text, jsonb) to anon, authenticated;
