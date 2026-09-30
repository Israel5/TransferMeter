-- What the database refuses.
--
-- These are the rules that stand between a stranger's form post and a stored
-- quote, and they are the reason quote 2026-015 arrived without the customer's
-- route: the check meant to keep his trips could not pass, and nothing said so.
-- A rule nobody tests is a rule that has already stopped working somewhere.
--
-- Run against a throwaway Postgres: npm run test:db

\set ON_ERROR_STOP on
\set QUIET on
-- notice, not warning: the run prints how many rules it checked, so a pass
-- that checked nothing cannot be mistaken for a pass.
set client_min_messages = notice;

set client_min_messages = warning;
\i supabase/test/harness.sql
\i supabase/schema.sql
set client_min_messages = notice;

-- One driver, as a real installation has.
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
  on conflict do nothing;
update public.config set request_secret = 'test-secret' where id;
insert into public.settings (owner, data)
  values ('11111111-1111-1111-1111-111111111111', '{"homeName":"Home Base"}'::jsonb)
  on conflict (owner) do update set data = excluded.data;

create or replace function pg_temp.check_all() returns void language plpgsql as $t$
declare
  probe   text;
  reason  text;
  failed  int := 0;
  ran     int := 0;
  tok     text;
  got     jsonb;
begin
  -- ------------------------------------------------- what must be refused ---
  for probe, reason in
    select * from (values
      ('{"contact":"+1514","trips":[{"from":"A","to":"B"}]}',              'no name'),
      ('{"customer":"  ","contact":"+1514","trips":[{"from":"A","to":"B"}]}', 'blank name'),
      ('{"customer":"A","trips":[{"from":"A","to":"B"}]}',                 'no contact'),
      ('{"customer":"A","contact":"","trips":[{"from":"A","to":"B"}]}',    'blank contact'),
      ('{"customer":"A","contact":"+1514"}',                               'no trips key at all'),
      ('{"customer":"A","contact":"+1514","trips":null}',                  'trips null'),
      ('{"customer":"A","contact":"+1514","trips":[]}',                    'trips empty'),
      ('{"customer":"A","contact":"+1514","trips":"nope"}',                'trips not a list'),
      ('{"customer":"A","contact":"+1514","trips":[["A","B"]]}',           'a leg that is not an object'),
      ('{"customer":"A","contact":"+1514","trips":[{"to":"B"}]}',          'no pickup'),
      ('{"customer":"A","contact":"+1514","trips":[{"from":"A"}]}',        'no destination'),
      ('{"customer":"A","contact":"+1514","trips":[{"from":" ","to":"B"}]}','blank pickup'),
      ('{"customer":"A","contact":"+1514","trips":[{"from":"A","to":" "}]}','blank destination'),
      ('{"customer":"A","contact":"+1514","trips":[{"from":"A","to":"B"},{"from":"B"}]}',
                                                                           'second leg missing its destination'),
      ('{"customer":"A","contact":"+1514","trips":[{"from":"A","to":"B"},{"from":"B","to":"A"},
        {"from":"A","to":"B"},{"from":"B","to":"A"},{"from":"A","to":"B"}]}', 'too many legs')
    ) as v(p, r)
  loop
    ran := ran + 1;
    begin
      perform public.request_quote(probe::jsonb, 'test-secret');
      failed := failed + 1;
      raise warning 'ACCEPTED but should not have been: %', reason;
    exception
      when sqlstate 'P0001' then null;   -- raise exception: refused, as intended
      when others then
        failed := failed + 1;
        raise warning 'refused for the wrong reason (%): % -> %', reason, sqlstate, sqlerrm;
    end;
  end loop;

  -- the wrong secret, which is the other way in
  ran := ran + 1;
  begin
    perform public.request_quote(
      '{"customer":"A","contact":"+1514","trips":[{"from":"A","to":"B"}]}'::jsonb, 'wrong');
    failed := failed + 1;
    raise warning 'ACCEPTED but should not have been: wrong secret';
  exception when others then null;
  end;

  -- ------------------------------------------------- what must be accepted --
  ran := ran + 1;
  tok := public.request_quote('{"customer":"Real Person","contact":"+15140000000","lang":"pt",
    "trips":[{"label":"Outbound","date":"2026-09-12","time":"06:00","from":"70 Rue Saint-Ferdinand","to":"YUL"},
             {"label":"Return","date":"2026-09-20","time":"19:00","from":"YUL","to":"70 Rue Saint-Ferdinand"}],
    "pax":{"adults":2,"children":1},"bags":{"checked":3}}'::jsonb, 'test-secret');
  select data into got from public.quotes where share_token = tok;

  -- the route survived: this is the assertion the old code would have failed
  if jsonb_array_length(got->'trips') <> 2 then
    failed := failed + 1;
    raise warning 'a complete request stored % legs, expected 2', jsonb_array_length(got->'trips');
  end if;
  if got->'trips'->0->>'date' <> '2026-09-12' or got->'trips'->0->>'time' <> '06:00' then
    failed := failed + 1; raise warning 'the date and time did not survive: %', got->'trips'->0;
  end if;
  if jsonb_array_length(got->'trips'->0->'stops') <> 4
     or got->'trips'->0->'stops'->1->>'name' <> '70 Rue Saint-Ferdinand'
     or got->'trips'->0->'stops'->2->>'name' <> 'YUL' then
    failed := failed + 1; raise warning 'the route is not driveable: %', got->'trips'->0->'stops';
  end if;
  -- it starts and ends at the driver's own address, and those are marked base
  if not (got->'trips'->0->'stops'->0->>'base')::boolean
     or not (got->'trips'->0->'stops'->3->>'base')::boolean then
    failed := failed + 1; raise warning 'the loop does not start and end at home';
  end if;
  if got->'pax'->>'adults' <> '2' or got->'bags'->>'checked' <> '3' then
    failed := failed + 1; raise warning 'the counts did not survive: % %', got->'pax', got->'bags';
  end if;

  -- ------------------------------------------ where the child seats go -----
  -- The map in the browser prunes as you go, but the browser is only where
  -- the honest ones answer. These are the rules that hold when it doesn't.

  -- A place the car does not have is dropped, and so is a device that is not
  -- one of the three.
  ran := ran + 1;
  got := public.clean_slots(
           '{"2L":"carSeat","2M":"booster","3R":"carSeat","2R":"hoverboard"}'::jsonb,
           '{"carSeat":2,"booster":2}'::jsonb);
  if got <> '{"2L":"carSeat"}'::jsonb then
    failed := failed + 1;
    raise warning 'a place the car has not, or a device it knows not, survived: %', got;
  end if;

  -- A placement the counts never paid for is dropped: this is the rule that
  -- keeps the two answers from disagreeing.
  ran := ran + 1;
  got := public.clean_slots('{"2L":"carSeat","2R":"booster"}'::jsonb,
                            '{"carSeat":1,"booster":0}'::jsonb);
  if got <> '{"2L":"carSeat"}'::jsonb then
    failed := failed + 1;
    raise warning 'a seat nobody asked for stayed strapped in: %', got;
  end if;

  -- Two of a kind asked for is two of a kind placed; the count is a budget,
  -- not a switch.
  ran := ran + 1;
  got := public.clean_slots('{"2L":"booster","2R":"booster"}'::jsonb,
                            '{"booster":2}'::jsonb);
  if got <> '{"2L":"booster","2R":"booster"}'::jsonb then
    failed := failed + 1; raise warning 'two boosters would not both fit: %', got;
  end if;

  -- A stranger's gear counts are not checked before this runs, so a count
  -- that is not a number must not take the whole request down with it.
  ran := ran + 1;
  got := public.clean_slots('{"2L":"carSeat"}'::jsonb, '{"carSeat":"lots"}'::jsonb);
  if got <> '{}'::jsonb then
    failed := failed + 1; raise warning 'a nonsense count placed a seat: %', got;
  end if;

  -- Nothing said at all is a complete answer, not a broken one.
  ran := ran + 1;
  if public.clean_slots(null, '{"carSeat":1}'::jsonb) <> '{}'::jsonb
     or public.clean_slots('"nope"'::jsonb, '{"carSeat":1}'::jsonb) <> '{}'::jsonb then
    failed := failed + 1; raise warning 'no preference did not survive as no preference';
  end if;

  -- End to end: a request carries its places in, and a later save that drops
  -- the gear takes the seat back out of the car.
  ran := ran + 1;
  tok := public.request_quote('{"customer":"Seat Map","contact":"+15140000001",
    "trips":[{"from":"A","to":"B"}],
    "pax":{"adults":2,"infants":1},"gear":{"infantSeat":1},
    "slots":{"2R":"infantSeat","3L":"infantSeat"}}'::jsonb, 'test-secret');
  select data into got from public.quotes where share_token = tok;
  if got->'slots' <> '{"2R":"infantSeat"}'::jsonb then
    failed := failed + 1; raise warning 'the places did not survive the request: %', got->'slots';
  end if;

  ran := ran + 1;
  update public.quotes set status = 'sent' where share_token = tok;
  perform public.update_quote_counts(tok, '{"gear":{"infantSeat":0,"booster":1}}'::jsonb);
  select data into got from public.quotes where share_token = tok;
  if got->'slots' <> '{}'::jsonb then
    failed := failed + 1;
    raise warning 'lowering the count left a seat strapped in: %', got->'slots';
  end if;

  -- ----------------------------------------- the flight, and whose seats -----
  ran := ran + 1;
  tok := public.request_quote('{"customer":"Flight Deck","contact":"+15140000002",
    "trips":[{"label":"Outbound","from":"YUL","to":"Home","flight":" ac 878 "},
             {"label":"Return","from":"Home","to":"YUL","flight":"ac879"}],
    "ownSeats":true}'::jsonb, 'test-secret');
  select data into got from public.quotes where share_token = tok;
  -- Stored the way a board wants it, whatever the customer typed.
  if got->'trips'->0->>'flight' <> 'AC878' or got->'trips'->1->>'flight' <> 'AC879' then
    failed := failed + 1;
    raise warning 'the flight numbers did not survive: % %',
      got->'trips'->0->>'flight', got->'trips'->1->>'flight';
  end if;
  -- Each leg keeps its own: a return is rarely the same flight back.
  if (got->'ownSeats')::boolean is not true then
    failed := failed + 1; raise warning 'whose seats they are did not survive: %', got->'ownSeats';
  end if;

  -- Anything but a real yes is a no. A stranger's "maybe" is not a promise
  -- the driver can leave a child seat at home on.
  ran := ran + 1;
  tok := public.request_quote('{"customer":"Maybe","contact":"+15140000003",
    "trips":[{"from":"A","to":"B","flight":"<script>"}],"ownSeats":"yes"}'::jsonb, 'test-secret');
  select data into got from public.quotes where share_token = tok;
  if (got->'ownSeats')::boolean is not false then
    failed := failed + 1; raise warning 'a non-answer was read as yes: %', got->'ownSeats';
  end if;
  if got->'trips'->0->>'flight' <> 'SCRIPT' then
    failed := failed + 1;
    raise warning 'a flight number was stored unscrubbed: %', got->'trips'->0->>'flight';
  end if;

  -- ------------------------------------------- the table refuses it too -----
  -- Belt and braces: whatever writes, a quote without a leg cannot be stored.
  ran := ran + 1;
  begin
    insert into public.quotes (owner, data)
      values ('11111111-1111-1111-1111-111111111111', '{"trips":[]}'::jsonb);
    failed := failed + 1;
    raise warning 'ACCEPTED but should not have been: a quote row with no legs';
  exception when check_violation then null;
  end;

  ran := ran + 1;
  begin
    insert into public.quotes (owner, data)
      values ('11111111-1111-1111-1111-111111111111', '{"customer":"X"}'::jsonb);
    failed := failed + 1;
    raise warning 'ACCEPTED but should not have been: a quote row with no trips key';
  exception when check_violation then null;
  end;

  if failed > 0 then
    raise exception '% of % database rules are not holding', failed, ran;
  end if;
  raise notice 'all % database rules hold', ran;
end $t$;

select pg_temp.check_all();
