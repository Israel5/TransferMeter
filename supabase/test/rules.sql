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
