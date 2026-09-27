-- Revenue reports are membership-period based. Keep payment_date unchanged as
-- the actual receipt timestamp, and use reporting_date solely for reporting.

alter table public.payments
  add column reporting_date date;

create or replace function private.set_payment_reporting_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
begin
  if new.reporting_date is null then
    select coalesce((select timezone from public.gym_settings where singleton), 'Asia/Karachi')
      into v_timezone;

    select s.start_date into new.reporting_date
    from public.member_subscriptions s
    where s.id = new.subscription_id;

    new.reporting_date := coalesce(
      new.reporting_date,
      (new.payment_date at time zone v_timezone)::date
    );
  end if;

  return new;
end;
$$;

create trigger payments_set_reporting_date
before insert on public.payments
for each row execute function private.set_payment_reporting_date();

-- All existing payments in this installation are linked to memberships. The
-- backfill is additive: receipt timestamps and amounts are never changed.
update public.payments py
set reporting_date = s.start_date
from public.member_subscriptions s
where s.id = py.subscription_id
  and py.reporting_date is null;

update public.payments
set reporting_date = (payment_date at time zone coalesce(
  (select timezone from public.gym_settings where singleton),
  'Asia/Karachi'
))::date
where reporting_date is null;

alter table public.payments
  alter column reporting_date set not null;

create index payments_reporting_date_idx
  on public.payments (reporting_date desc)
  where not is_voided;

create or replace function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid report date range' using errcode = '22007';
  end if;

  select jsonb_build_object(
    'total_revenue', coalesce((
      select sum(amount) from public.payments
      where not is_voided and reporting_date between p_from and p_to
    ), 0),
    'total_expenses', coalesce((
      select sum(amount) from public.expenses
      where not is_deleted and expense_date between p_from and p_to
    ), 0),
    'outstanding_amount', coalesce((
      select sum(balance) from public.member_overview where balance > 0
    ), 0)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function private.set_payment_reporting_date() from public, anon, authenticated;
