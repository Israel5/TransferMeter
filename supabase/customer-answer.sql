-- Let a customer read and answer their own quote, with no table access.
--
-- What they may see is decided by the application when it saves, and stored in
-- customer_view: their legs, their totals, the driver's name. Never the home
-- address, the fuel cost, the tip or the notes. The database just serves that
-- column, so there is one place where the rule lives.

alter table public.quotes add column if not exists customer_view jsonb;

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
