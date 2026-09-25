-- Harden FITX business invariants without rewriting existing application data.

create or replace function private.validate_gym_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone: %', new.timezone using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger gym_settings_validate_timezone
before insert or update of timezone on public.gym_settings
for each row execute function private.validate_gym_timezone();

create or replace function private.validate_subscription_term()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_join_date date;
  v_duration integer;
  v_expected_end date;
begin
  if tg_op = 'UPDATE'
    and new.member_id is not distinct from old.member_id
    and new.plan_id is not distinct from old.plan_id
    and new.start_date is not distinct from old.start_date
    and new.end_date is not distinct from old.end_date
  then
    return new;
  end if;

  select join_date into v_join_date from public.members where id = new.member_id;
  if v_join_date is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;
  if new.start_date < v_join_date then
    raise exception 'Membership cannot start before the member join date' using errcode = '23514';
  end if;

  select duration_months into v_duration from public.membership_plans where id = new.plan_id and is_active;
  if v_duration is null then
    raise exception 'Active membership plan not found' using errcode = '23503';
  end if;
  v_expected_end := (new.start_date + make_interval(months => v_duration) - interval '1 day')::date;
  if new.end_date <> v_expected_end then
    raise exception 'Membership end date must match the selected plan duration' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger member_subscriptions_validate_term
before insert or update of member_id, plan_id, start_date, end_date on public.member_subscriptions
for each row execute function private.validate_subscription_term();

create or replace function private.validate_member_join_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.join_date is distinct from old.join_date and exists (
    select 1
    from public.member_subscriptions s
    where s.member_id = new.id
      and s.status <> 'cancelled'
      and s.start_date < new.join_date
  ) then
    raise exception 'Join date cannot be later than an existing membership start date' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger members_validate_join_date
before update of join_date on public.members
for each row execute function private.validate_member_join_date();

create or replace function private.validate_payment_balance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_due numeric;
  v_member_id uuid;
  v_paid numeric;
begin
  if new.is_voided then
    return new;
  end if;

  if not exists (
    select 1 from public.payment_methods pm
    where pm.id = new.payment_method_id and pm.is_active
  ) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;

  if new.subscription_id is null then
    return new;
  end if;

  select s.final_amount, s.member_id
  into v_due, v_member_id
  from public.member_subscriptions s
  where s.id = new.subscription_id
  for update;

  if v_due is null or v_member_id <> new.member_id then
    raise exception 'Membership not found for member' using errcode = '23503';
  end if;

  select coalesce(sum(p.amount), 0)
  into v_paid
  from public.payments p
  where p.subscription_id = new.subscription_id
    and not p.is_voided
    and p.id <> new.id;

  if v_paid + new.amount > v_due then
    raise exception 'Payment exceeds outstanding balance' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payments_validate_balance
before insert or update of member_id, subscription_id, amount, payment_method_id, is_voided on public.payments
for each row execute function private.validate_payment_balance();

create or replace function public.create_member_with_membership(
  p_full_name text, p_phone text, p_join_date date, p_plan_id uuid,
  p_start_date date, p_amount numeric, p_email text default null,
  p_national_id text default null, p_gender text default null,
  p_date_of_birth date default null, p_address text default null,
  p_emergency_contact_name text default null, p_emergency_contact_phone text default null,
  p_notes text default null, p_profile_photo_path text default null,
  p_discount numeric default 0, p_amount_paid numeric default 0,
  p_payment_method_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_member_id uuid; v_subscription_id uuid; v_duration integer; v_end_date date;
begin
  if not (select private.is_active_staff()) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_join_date is null or p_start_date is null or p_start_date < p_join_date then
    raise exception 'Membership cannot start before the member join date' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0 or p_discount is null or p_discount < 0 or p_discount > p_amount then
    raise exception 'Invalid membership amount or discount' using errcode = '23514';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > p_amount - p_discount then raise exception 'Invalid initial payment' using errcode = '23514'; end if;
  if p_amount_paid > 0 and p_payment_method_id is null then raise exception 'Payment method is required' using errcode = '23514'; end if;
  if p_amount_paid > 0 and not exists (select 1 from public.payment_methods where id = p_payment_method_id and is_active) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;
  select duration_months into v_duration from public.membership_plans where id = p_plan_id and is_active;
  if v_duration is null then raise exception 'Active membership plan not found' using errcode = '23503'; end if;
  v_end_date := (p_start_date + make_interval(months => v_duration) - interval '1 day')::date;
  insert into public.members(full_name, phone, email, national_id, gender, date_of_birth, address,
    emergency_contact_name, emergency_contact_phone, join_date, notes, profile_photo_path)
  values (p_full_name, p_phone, p_email, p_national_id, p_gender, p_date_of_birth, p_address,
    p_emergency_contact_name, p_emergency_contact_phone, p_join_date, p_notes, p_profile_photo_path)
  returning id into v_member_id;
  insert into public.member_subscriptions(member_id, plan_id, start_date, end_date, amount, discount)
  values (v_member_id, p_plan_id, p_start_date, v_end_date, p_amount, p_discount)
  returning id into v_subscription_id;
  if p_amount_paid > 0 then
    insert into public.payments(member_id, subscription_id, amount, payment_method_id, payment_type)
    values (v_member_id, v_subscription_id, p_amount_paid, p_payment_method_id, 'registration');
  end if;
  return v_member_id;
end;
$$;

create or replace function public.record_payment(
  p_member_id uuid, p_amount numeric, p_payment_method_id uuid, p_payment_date timestamptz,
  p_subscription_id uuid default null, p_payment_type text default 'membership',
  p_reference_number text default null, p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_payment_id uuid; v_due numeric; v_paid numeric;
begin
  if not (select private.is_active_staff()) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero' using errcode = '23514'; end if;
  if not exists (select 1 from public.payment_methods where id = p_payment_method_id and is_active) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;
  if p_subscription_id is not null then
    select final_amount into v_due from public.member_subscriptions where id = p_subscription_id and member_id = p_member_id for update;
    if v_due is null then raise exception 'Membership not found for member' using errcode = '23503'; end if;
    select coalesce(sum(amount), 0) into v_paid from public.payments where subscription_id = p_subscription_id and not is_voided;
    if v_paid + p_amount > v_due then raise exception 'Payment exceeds outstanding balance' using errcode = '23514'; end if;
  end if;
  insert into public.payments(member_id, subscription_id, amount, payment_method_id, payment_date,
    payment_type, reference_number, notes)
  values (p_member_id, p_subscription_id, p_amount, p_payment_method_id, coalesce(p_payment_date, now()),
    p_payment_type, p_reference_number, p_notes)
  returning id into v_payment_id;
  return v_payment_id;
end;
$$;

create or replace function public.renew_membership(
  p_member_id uuid, p_plan_id uuid, p_renewal_date date, p_amount numeric,
  p_discount numeric default 0, p_amount_paid numeric default 0,
  p_payment_method_id uuid default null, p_reference_number text default null,
  p_notes text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_previous uuid; v_previous_end date; v_new uuid; v_payment uuid; v_duration integer; v_start date; v_end date;
begin
  if not (select private.is_active_staff()) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_renewal_date is null then raise exception 'Renewal date is required' using errcode = '23514'; end if;
  if p_amount is null or p_amount < 0 or p_discount is null or p_discount < 0 or p_discount > p_amount then
    raise exception 'Invalid membership amount or discount' using errcode = '23514';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > p_amount - p_discount then raise exception 'Invalid renewal payment' using errcode = '23514'; end if;
  if p_amount_paid > 0 and p_payment_method_id is null then raise exception 'Payment method is required' using errcode = '23514'; end if;
  if p_amount_paid > 0 and not exists (select 1 from public.payment_methods where id = p_payment_method_id and is_active) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;
  select id, end_date into v_previous, v_previous_end from public.member_subscriptions
    where member_id = p_member_id and is_current and status <> 'cancelled' for update;
  if v_previous is null then raise exception 'Current membership not found' using errcode = '23503'; end if;
  select duration_months into v_duration from public.membership_plans where id = p_plan_id and is_active;
  if v_duration is null then raise exception 'Active membership plan not found' using errcode = '23503'; end if;
  v_start := greatest(p_renewal_date, v_previous_end + 1);
  v_end := (v_start + make_interval(months => v_duration) - interval '1 day')::date;
  update public.member_subscriptions set is_current = false where id = v_previous;
  insert into public.member_subscriptions(member_id, plan_id, start_date, end_date, amount, discount, notes)
  values (p_member_id, p_plan_id, v_start, v_end, p_amount, p_discount, p_notes) returning id into v_new;
  if p_amount_paid > 0 then
    insert into public.payments(member_id, subscription_id, amount, payment_method_id, payment_date,
      payment_type, reference_number, notes)
    values (p_member_id, v_new, p_amount_paid, p_payment_method_id, now(), 'renewal', p_reference_number, p_notes)
    returning id into v_payment;
  end if;
  insert into public.membership_renewals(member_id, previous_subscription_id, new_subscription_id,
    renewal_date, payment_id)
  values (p_member_id, v_previous, v_new, p_renewal_date, v_payment);
  return v_new;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.has_role(array['owner','admin']::public.app_role[])) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 2 or char_length(p_reason) > 500 then
    raise exception 'A void reason between 2 and 500 characters is required' using errcode = '23514';
  end if;
  update public.payments set is_voided = true, voided_at = now(), voided_by = (select auth.uid()), void_reason = btrim(p_reason) where id = p_payment_id and not is_voided;
  if not found then raise exception 'Payment not found or already voided' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.resolve_complaint(p_complaint_id uuid, p_response text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not (select private.is_active_staff()) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_response is null or char_length(btrim(p_response)) < 2 or char_length(p_response) > 5000 then
    raise exception 'A response between 2 and 5000 characters is required' using errcode = '23514';
  end if;
  update public.complaints_feedback set status = 'resolved', admin_response = btrim(p_response),
    resolved_at = now(), resolved_by = (select auth.uid()) where id = p_complaint_id;
  if not found then raise exception 'Complaint not found' using errcode = 'P0002'; end if;
end; $$;

create or replace view public.member_overview
with (security_invoker = true)
as
select
  m.*,
  s.id as subscription_id,
  s.plan_id,
  p.name as plan_name,
  s.start_date,
  s.end_date,
  s.amount as membership_amount,
  s.discount,
  s.final_amount,
  coalesce(pay.amount_paid, 0)::numeric(12,2) as amount_paid,
  greatest(s.final_amount - coalesce(pay.amount_paid, 0), 0)::numeric(12,2) as balance,
  s.status as subscription_status,
  case
    when m.status <> 'active' then m.status
    when s.id is null or s.end_date < local_clock.today then 'expired'
    when s.end_date <= local_clock.today + coalesce(gs.membership_expiry_warning_days, 7) then 'expiring_soon'
    else 'active'
  end as membership_status,
  case
    when s.id is null or coalesce(pay.amount_paid, 0) = 0 then 'unpaid'
    when coalesce(pay.amount_paid, 0) >= s.final_amount then 'paid'
    else 'partial'
  end as payment_status
from public.members m
left join public.member_subscriptions s on s.member_id = m.id and s.is_current and s.status <> 'cancelled'
left join public.membership_plans p on p.id = s.plan_id
left join lateral (
  select coalesce(sum(py.amount), 0) as amount_paid
  from public.payments py
  where py.subscription_id = s.id and not py.is_voided
) pay on true
left join public.gym_settings gs on gs.singleton
cross join lateral (
  select (now() at time zone coalesce(gs.timezone, 'Asia/Karachi'))::date as today
) local_clock;

create or replace function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_from timestamptz;
  v_to_exclusive timestamptz;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid report date range' using errcode = '22007';
  end if;
  select coalesce((select timezone from public.gym_settings where singleton), 'Asia/Karachi') into v_timezone;
  v_from := p_from::timestamp at time zone v_timezone;
  v_to_exclusive := (p_to + 1)::timestamp at time zone v_timezone;
  select jsonb_build_object(
    'total_revenue', coalesce((select sum(amount) from public.payments where not is_voided and payment_date >= v_from and payment_date < v_to_exclusive), 0),
    'total_expenses', coalesce((select sum(amount) from public.expenses where not is_deleted and expense_date between p_from and p_to), 0),
    'outstanding_amount', coalesce((select sum(balance) from public.member_overview where balance > 0), 0)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.dashboard_summary(p_months integer default 6)
returns jsonb language sql stable security invoker set search_path = '' as $$
with settings as (
  select coalesce((select timezone from public.gym_settings where singleton), 'Asia/Karachi') as timezone
), clock as (
  select timezone, (now() at time zone timezone)::date as today from settings
), bounds as (
  select
    timezone,
    case
      when extract(day from today) >= 10 then make_date(extract(year from today)::int, extract(month from today)::int, 10)::date
      else (make_date(extract(year from today)::int, extract(month from today)::int, 10) - interval '1 month')::date
    end as this_month,
    case
      when extract(day from today) >= 10 then (make_date(extract(year from today)::int, extract(month from today)::int, 10) - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date
      else ((make_date(extract(year from today)::int, extract(month from today)::int, 10) - interval '1 month') - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date
    end as first_month,
    today
  from clock
), months as (
  select generate_series(first_month, this_month, interval '1 month')::date as month_start, timezone from bounds
), trend as (
  select jsonb_agg(jsonb_build_object(
    'label', to_char(month_start, 'Mon YY'),
    'revenue', coalesce((select sum(amount) from public.payments where not is_voided and payment_date >= (month_start::timestamp at time zone timezone) and payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)), 0),
    'expenses', coalesce((select sum(amount) from public.expenses where not is_deleted and expense_date >= month_start and expense_date < month_start + interval '1 month'), 0),
    'profit', coalesce((select sum(amount) from public.payments where not is_voided and payment_date >= (month_start::timestamp at time zone timezone) and payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)), 0) - coalesce((select sum(amount) from public.expenses where not is_deleted and expense_date >= month_start and expense_date < month_start + interval '1 month'), 0),
    'new_members', (select count(*) from public.members where join_date >= month_start and join_date < month_start + interval '1 month')
  ) order by month_start) value from months
)
select jsonb_build_object(
  'metrics', jsonb_build_object(
    'total_members', (select count(*) from public.members where status <> 'archived'),
    'active_members', (select count(*) from public.member_overview where membership_status = 'active'),
    'expiring_soon', (select count(*) from public.member_overview where membership_status = 'expiring_soon'),
    'unpaid_fees', (select count(*) from public.member_overview where payment_status in ('partial','unpaid')),
    'monthly_revenue', coalesce((select sum(amount) from public.payments, bounds where not is_voided and payment_date >= (this_month::timestamp at time zone timezone) and payment_date < ((this_month + interval '1 month')::timestamp at time zone timezone)), 0),
    'monthly_expenses', coalesce((select sum(amount) from public.expenses, bounds where not is_deleted and expense_date >= this_month and expense_date < this_month + interval '1 month'), 0),
    'net_profit', coalesce((select sum(amount) from public.payments, bounds where not is_voided and payment_date >= (this_month::timestamp at time zone timezone) and payment_date < ((this_month + interval '1 month')::timestamp at time zone timezone)), 0) - coalesce((select sum(amount) from public.expenses, bounds where not is_deleted and expense_date >= this_month and expense_date < this_month + interval '1 month'), 0),
    'pending_complaints', (select count(*) from public.complaints_feedback where status in ('new','reviewing')),
    'equipment_maintenance', (select count(*) from public.equipment, bounds where status = 'maintenance' or next_maintenance_date <= today)
  ),
  'trend', (select value from trend),
  'membership_status', (select coalesce(jsonb_agg(jsonb_build_object('name', membership_status, 'value', amount)), '[]') from (select membership_status, count(*) amount from public.member_overview group by membership_status) x),
  'payment_status', (select coalesce(jsonb_agg(jsonb_build_object('name', payment_status, 'value', amount)), '[]') from (select payment_status, count(*) amount from public.member_overview group by payment_status) x),
  'plan_distribution', (select coalesce(jsonb_agg(jsonb_build_object('name', plan_name, 'value', amount)), '[]') from (select coalesce(plan_name,'No plan') plan_name, count(*) amount from public.member_overview group by plan_name) x),
  'recent_members', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select * from public.member_overview order by created_at desc limit 5) x),
  'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object('id', py.id, 'payment_number', py.payment_number, 'payment_date', py.payment_date, 'member_id', py.member_id, 'member_name', m.full_name, 'amount', py.amount, 'status', case when py.is_voided then 'voided' else 'paid' end)), '[]') from (select * from public.payments order by payment_date desc limit 5) py join public.members m on m.id = py.member_id),
  'recent_expenses', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'expense_number', e.expense_number, 'title', e.title, 'expense_date', e.expense_date, 'amount', e.amount, 'category_name', c.name)), '[]') from (select * from public.expenses where not is_deleted order by expense_date desc limit 5) e join public.expense_categories c on c.id = e.category_id)
);
$$;

drop policy fitx_images_delete on storage.objects;
create policy fitx_images_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('member-photos','staff-photos','gym-assets')
  and (select private.is_active_staff())
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or (select private.has_role(array['owner']::public.app_role[]))
  )
);

create index if not exists membership_renewals_previous_subscription_idx
  on public.membership_renewals (previous_subscription_id);
create index if not exists membership_renewals_payment_idx
  on public.membership_renewals (payment_id) where payment_id is not null;
create index if not exists reminder_logs_setting_idx
  on public.reminder_logs (reminder_setting_id);
create index if not exists reminder_logs_subscription_idx
  on public.reminder_logs (subscription_id) where subscription_id is not null;

revoke all on function private.validate_gym_timezone() from public, anon, authenticated;
revoke all on function private.validate_subscription_term() from public, anon, authenticated;
revoke all on function private.validate_member_join_date() from public, anon, authenticated;
revoke all on function private.validate_payment_balance() from public, anon, authenticated;
