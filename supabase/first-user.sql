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
