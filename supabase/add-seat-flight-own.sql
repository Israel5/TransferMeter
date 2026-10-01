-- Where a child seat goes, the flight a leg meets, and whose the seats are.
--
-- Three functions, replaced in place. Nothing else in schema.sql changed, so
-- only these are here: the rest of that file drops and recreates policies and
-- triggers and touches config, and none of that needs doing to add a field.
--
-- Safe to run more than once. Every statement replaces a definition rather
-- than creating one, no table is touched, and no row is read or written.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/add-seat-flight-own.sql

begin;

-- ------------------------------------------------- child seat places -------
-- Where a child seat is strapped in, as opposed to how many there are.
--
-- Two rules, and both are here rather than in the browser because a browser
-- is only where the honest ones answer. A place must be one the car actually
-- has -- the outboard pair of the middle row, since the third row has no
-- tether and the middle of the bench is too narrow to take one beside
-- another. And a place may only hold a device the gear counts already paid
-- for, so lowering a count to zero takes its seat out of the car rather than
-- leaving it strapped in with nothing to explain it. Anything else is
-- dropped rather than argued with, the same way the counts are.
--
-- That second rule is what keeps "two boosters" and "a booster on each side"
-- from ever becoming two different answers to the same question.
create or replace function public.clean_slots(slots jsonb, gear jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from (
      select k, v, row_number() over (partition by v order by k) as nth
        from jsonb_each_text(case when jsonb_typeof(slots) = 'object'
                                  then slots else '{}'::jsonb end) as e(k, v)
       where k in ('2L', '2R')
         and v in ('infantSeat', 'carSeat', 'booster')
    ) placed
   -- The gear here may be a stranger's unchecked object, so the count is read
   -- only when it looks like a number at all.
   where nth <= case when (gear ->> v) ~ '^[0-9]+$' then (gear ->> v)::int else 0 end
$$;

-- ------------------------------------------------- customer asks for one ---
-- A stranger may create a request and nothing else. They cannot choose the

create or replace function public.request_quote(payload jsonb, secret text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  the_owner uuid;
  recent    int;
  clean     jsonb;
  want      text;
  new_id    bigint;
  home      text;
  legs      jsonb;
begin
  select owner, request_secret into the_owner, want from public.config where id;
  if the_owner is null then raise exception 'no driver configured'; end if;
  if want is null or secret is distinct from want then
    raise exception 'that request did not come from the form';
  end if;

  select count(*) into recent
    from public.quotes
   where status = 'requested' and created_at > now() - interval '1 minute';
  if recent >= 5 then raise exception 'too many requests, try again shortly'; end if;

  if coalesce(trim(payload->>'customer'), '') = '' then
    raise exception 'a name is required';
  end if;
  if length(payload::text) > 8000 then
    raise exception 'that request is too large';
  end if;

  -- A way to reply, and both ends of the journey. Required *here*, because the
  -- form asks for all three and refuses to submit without them -- and the form
  -- runs in a browser, which can enforce nothing. This route is reachable
  -- directly. Every rule the form states has to be restated where it counts.
  if coalesce(trim(payload->>'contact'), '') = '' then
    raise exception 'a way to reply is required';
  end if;

  -- coalesce, because an absent key gives jsonb_typeof NULL, and NULL <> 'array'
  -- is NULL rather than true: the guard read correctly and let it straight past.
  if coalesce(jsonb_typeof(payload->'trips'), '') <> 'array'
     or jsonb_array_length(payload->'trips') = 0 then
    raise exception 'a pickup and a destination are required';
  end if;

  -- Every leg, not merely the first: a return leg missing its destination is a
  -- request the driver cannot act on either. Rejected outright rather than
  -- stored half-formed, so nothing is silently dropped a second time.
  if exists (
    select 1 from jsonb_array_elements(payload->'trips') t
     where jsonb_typeof(t) <> 'object'
        or coalesce(trim(t->>'from'), '') = ''
        or coalesce(trim(t->>'to'), '') = ''
  ) then
    raise exception 'a pickup and a destination are required';
  end if;

  -- Types are checked with jsonb_typeof, never with a jsonpath filter.
  -- `$.trips ? (@.type() == "array")` reads as "keep it if it is an array" and
  -- keeps nothing: jsonpath is lax by default, so it unwraps the array first
  -- and binds @ to each element, which is an object. The test could not pass,
  -- and the coalesce behind it turned every customer's route, date and time
  -- into [] on the way in. It did that to a real request before anyone noticed.
  if jsonb_typeof(payload->'trips') = 'array'
     and jsonb_array_length(payload->'trips') > 4 then
    raise exception 'too many legs in that request';
  end if;

  -- A customer says where they want to go; the app stores a route the car can
  -- drive, which leaves from and returns to the driver's own address. Convert
  -- here, so a request opens in the editor as an ordinary quote instead of as a
  -- shape nothing downstream knows how to read.
  select coalesce(data->>'homeName', '') into home
    from public.settings where owner = the_owner limit 1;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'legId', 'r' || md5(random()::text || clock_timestamp()::text),
             'label', case when t->>'label' = 'Return' then 'Return' else 'Outbound' end,
             'date',  left(coalesce(t->>'date', ''), 10),
             'time',  left(coalesce(t->>'time', ''), 5),
             'flight', left(regexp_replace(upper(coalesce(t->>'flight', '')),
                                           '[^A-Z0-9]', '', 'g'), 8),
             'stops', case when home = '' then '[]'::jsonb
                           else jsonb_build_array(jsonb_build_object('name', home, 'base', true)) end
                   || jsonb_build_array(
                        jsonb_build_object('name', left(coalesce(trim(t->>'from'), ''), 200), 'base', false),
                        jsonb_build_object('name', left(coalesce(trim(t->>'to'),   ''), 200), 'base', false))
                   || case when home = '' then '[]'::jsonb
                           else jsonb_build_array(jsonb_build_object('name', home, 'base', true)) end,
             -- Nothing is measured or priced yet; the driver does that on opening it.
             'legKm', '[]'::jsonb,
             'totalKm', 0, 'mins', 0, 'cost', 0, 'price', 0,
             'paxKm', 0, 'paxMins', 0,
             'tip', 0, 'paid', false, 'override', null)
           order by ord), '[]'::jsonb)
    into legs
    from jsonb_array_elements(payload->'trips') with ordinality as e(t, ord);

  clean := jsonb_build_object(
    'customer', left(trim(payload->>'customer'), 120),
    'contact',  left(coalesce(trim(payload->>'contact'), ''), 60),
    'notes',    left(coalesce(trim(payload->>'note'), ''), 1000),
    'lang',     case when payload->>'lang' in ('pt','en','fr') then payload->>'lang' else 'pt' end,
    'origin',   'customer',
    'savedAt',  to_jsonb(now()),
    'trips',    legs,
    'pax',      case when jsonb_typeof(payload->'pax')  = 'object' then payload->'pax'  else '{}'::jsonb end,
    'gear',     case when jsonb_typeof(payload->'gear') = 'object' then payload->'gear' else '{}'::jsonb end,
    'bags',     case when jsonb_typeof(payload->'bags') = 'object' then payload->'bags' else '{}'::jsonb end,
    'ownSeats', (payload->'ownSeats') = 'true'::jsonb,
    'slots',    public.clean_slots(
                  payload->'slots',
                  case when jsonb_typeof(payload->'gear') = 'object'
                       then payload->'gear' else '{}'::jsonb end)
  );

  insert into public.quotes (owner, status, data)
  values (the_owner, 'requested', clean)
  returning id into new_id;

  return (select share_token from public.quotes where id = new_id);
end $$;

revoke all on function public.request_quote(jsonb, text) from public;
grant execute on function public.request_quote(jsonb, text) to anon, authenticated;

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
                   'ownSeats', case when counts ? 'ownSeats'
                                    then to_jsonb((counts -> 'ownSeats') = 'true'::jsonb)
                                    else coalesce(data -> 'ownSeats', 'false'::jsonb) end,
                   -- Re-checked whether or not this call sent any, because a
                   -- save that only lowers a gear count still has to take the
                   -- seat it paid for back out of the car.
                   'slots', public.clean_slots(
                              case when counts ? 'slots' then counts -> 'slots'
                                   else coalesce(data -> 'slots', '{}'::jsonb) end,
                              coalesce(nullif(clean -> 'gear', '{}'::jsonb),
                                       data -> 'gear', '{}'::jsonb)),
                   'customerEditedAt', to_jsonb(now())
                 ),
         updated_at = now()
   where share_token = token
     and status = 'sent'          -- only while it is still awaiting an answer
  returning * into q;

  if not found then
    raise exception 'that quote is not open for changes';
  end if;

  -- Read back from the quote itself, which is now the only copy of it.
  return jsonb_build_object('xc', jsonb_build_object(
    'pax',  coalesce(q.data -> 'pax',  '{}'::jsonb),
    'gear', coalesce(q.data -> 'gear', '{}'::jsonb),
    'bags',  coalesce(q.data -> 'bags',  '{}'::jsonb),
    'slots',    coalesce(q.data -> 'slots',    '{}'::jsonb),
    'ownSeats', coalesce(q.data -> 'ownSeats', 'false'::jsonb)));
end $$;

revoke all on function public.update_quote_counts(text, jsonb) from public;
grant execute on function public.update_quote_counts(text, jsonb) to anon, authenticated;

commit;
