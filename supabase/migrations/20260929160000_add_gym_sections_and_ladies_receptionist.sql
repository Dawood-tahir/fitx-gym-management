-- Additive section reporting and reception staffing support.
-- Existing members are preserved. Only unambiguous gender values are backfilled;
-- remaining members stay unclassified until they are edited.

alter type public.app_role add value if not exists 'ladies_receptionist' after 'receptionist';

alter table public.members
  add column section text;

alter table public.members
  add constraint members_section_check
  check (section is null or section in ('gents', 'ladies'));

update public.members
set section = case lower(gender)
  when 'male' then 'gents'
  when 'female' then 'ladies'
end
where section is null
  and lower(gender) in ('male', 'female');

create index members_section_active_idx
  on public.members (section)
  where status <> 'archived';

-- A view's `*` expansion is fixed when the view is created, so append the new
-- section column explicitly while preserving every existing column position.
create or replace view public.member_overview
with (security_invoker = true)
as
select
  m.id,
  m.member_code,
  m.full_name,
  m.phone,
  m.email,
  m.national_id,
  m.gender,
  m.date_of_birth,
  m.address,
  m.emergency_contact_name,
  m.emergency_contact_phone,
  m.join_date,
  m.status,
  m.notes,
  m.profile_photo_path,
  m.created_by,
  m.archived_at,
  m.created_at,
  m.updated_at,
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
    when m.status = 'suspended' then 'suspended'
    when m.status in ('inactive', 'archived') then m.status
    when s.id is null or s.status = 'cancelled' or s.end_date < clock.today then 'expired'
    when coalesce(pay.amount_paid, 0) < s.final_amount then 'payment_due'
    when s.end_date <= clock.today + coalesce(gs.membership_expiry_warning_days, 7) then 'expiring_soon'
    else 'active'
  end as membership_status,
  case
    when s.id is null or coalesce(pay.amount_paid, 0) = 0 then 'unpaid'
    when coalesce(pay.amount_paid, 0) >= s.final_amount then 'paid'
    else 'partial'
  end as payment_status,
  m.section
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
) clock;

drop function public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid
);

create function public.create_member_with_membership(
  p_full_name text, p_phone text, p_join_date date, p_plan_id uuid,
  p_start_date date, p_amount numeric, p_email text default null,
  p_national_id text default null, p_gender text default null,
  p_date_of_birth date default null, p_address text default null,
  p_emergency_contact_name text default null, p_emergency_contact_phone text default null,
  p_notes text default null, p_profile_photo_path text default null,
  p_discount numeric default 0, p_amount_paid numeric default 0,
  p_payment_method_id uuid default null, p_section text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_subscription_id uuid;
  v_duration integer;
  v_end_date date;
  v_section text;
begin
  if not (select private.is_active_staff()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_join_date is null or p_start_date is null or p_start_date < p_join_date then
    raise exception 'Membership cannot start before the member join date' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0 or p_discount is null or p_discount < 0 or p_discount > p_amount then
    raise exception 'Invalid membership amount or discount' using errcode = '23514';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > p_amount - p_discount then
    raise exception 'Invalid initial payment' using errcode = '23514';
  end if;
  if p_amount_paid > 0 and p_payment_method_id is null then
    raise exception 'Payment method is required' using errcode = '23514';
  end if;
  if p_amount_paid > 0 and not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and is_active
  ) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;

  v_section := coalesce(
    p_section,
    case lower(p_gender) when 'male' then 'gents' when 'female' then 'ladies' end
  );
  if v_section is not null and v_section not in ('gents', 'ladies') then
    raise exception 'Invalid gym section' using errcode = '23514';
  end if;

  select duration_months into v_duration
  from public.membership_plans
  where id = p_plan_id and is_active;
  if v_duration is null then
    raise exception 'Active membership plan not found' using errcode = '23503';
  end if;

  v_end_date := (p_start_date + make_interval(months => v_duration) - interval '1 day')::date;
  insert into public.members(
    full_name, phone, email, national_id, gender, section, date_of_birth, address,
    emergency_contact_name, emergency_contact_phone, join_date, notes, profile_photo_path
  ) values (
    p_full_name, p_phone, p_email, p_national_id, p_gender, v_section, p_date_of_birth, p_address,
    p_emergency_contact_name, p_emergency_contact_phone, p_join_date, p_notes, p_profile_photo_path
  ) returning id into v_member_id;

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

revoke all on function public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid, text
) from public, anon;
grant execute on function public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid, text
) to authenticated;

drop function public.dashboard_summary(integer);

create function public.dashboard_summary(
  p_months integer default 6,
  p_section text default 'all'
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_section text := lower(coalesce(p_section, 'all'));
  v_result jsonb;
begin
  if v_section not in ('all', 'gents', 'ladies') then
    raise exception 'Invalid dashboard section' using errcode = '22023';
  end if;

  with settings as (
    select coalesce((select timezone from public.gym_settings where singleton), 'Asia/Karachi') as timezone
  ), clock as (
    select timezone, (now() at time zone timezone)::date as today from settings
  ), cycle as (
    select timezone, today,
      case when extract(day from today) >= 10
        then make_date(extract(year from today)::int, extract(month from today)::int, 10)
        else (make_date(extract(year from today)::int, extract(month from today)::int, 10) - interval '1 month')::date
      end as cycle_start
    from clock
  ), bounds as (
    select *,
      (cycle_start + interval '1 month')::date as cycle_end_exclusive,
      (cycle_start - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date as first_month
    from cycle
  ), months as (
    select generate_series(first_month, cycle_start, interval '1 month')::date as month_start, timezone
    from bounds
  ), trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'label', to_char(month_start, 'Mon YY'),
      'revenue', coalesce((
        select sum(py.amount)
        from public.payments py
        join public.members m on m.id = py.member_id
        where not py.is_voided
          and py.payment_date >= (month_start::timestamp at time zone timezone)
          and py.payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)
          and (v_section = 'all' or m.section = v_section)
      ), 0),
      'expenses', coalesce((
        select sum(e.amount)
        from public.expenses e
        where not e.is_deleted
          and e.expense_date >= month_start
          and e.expense_date < month_start + interval '1 month'
      ), 0),
      'profit', case when v_section = 'all' then
        coalesce((
          select sum(py.amount)
          from public.payments py
          where not py.is_voided
            and py.payment_date >= (month_start::timestamp at time zone timezone)
            and py.payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)
        ), 0) - coalesce((
          select sum(e.amount)
          from public.expenses e
          where not e.is_deleted
            and e.expense_date >= month_start
            and e.expense_date < month_start + interval '1 month'
        ), 0)
        else null end,
      'new_members', (
        select count(*)
        from public.members m
        where m.join_date >= month_start
          and m.join_date < month_start + interval '1 month'
          and m.status <> 'archived'
          and (v_section = 'all' or m.section = v_section)
      )
    ) order by month_start), '[]'::jsonb) as value
    from months
  )
  select jsonb_build_object(
    'section', v_section,
    'profit_available', v_section = 'all',
    'metrics', jsonb_build_object(
      'total_members', (
        select count(*) from public.members m
        where m.status <> 'archived' and (v_section = 'all' or m.section = v_section)
      ),
      'unclassified_members', (
        select count(*) from public.members m
        where m.status <> 'archived' and m.section is null
      ),
      'active_members', (
        select count(*) from public.member_overview mo
        where mo.membership_status = 'active' and (v_section = 'all' or mo.section = v_section)
      ),
      'expiring_soon', (
        select count(*) from public.member_overview mo
        where mo.membership_status = 'expiring_soon' and (v_section = 'all' or mo.section = v_section)
      ),
      'expired_members', (
        select count(*) from public.member_overview mo
        where mo.membership_status = 'expired' and (v_section = 'all' or mo.section = v_section)
      ),
      'payment_due_members', (
        select count(*) from public.member_overview mo
        where mo.membership_status = 'payment_due' and (v_section = 'all' or mo.section = v_section)
      ),
      'unpaid_fees', (
        select count(*) from public.member_overview mo
        where mo.payment_status in ('partial', 'unpaid') and (v_section = 'all' or mo.section = v_section)
      ),
      'monthly_revenue', coalesce((
        select sum(py.amount)
        from public.payments py
        join public.members m on m.id = py.member_id
        cross join bounds b
        where not py.is_voided
          and py.payment_date >= (b.cycle_start::timestamp at time zone b.timezone)
          and py.payment_date < (b.cycle_end_exclusive::timestamp at time zone b.timezone)
          and (v_section = 'all' or m.section = v_section)
      ), 0),
      'revenue_today', coalesce((
        select sum(py.amount)
        from public.payments py
        join public.members m on m.id = py.member_id
        cross join bounds b
        where not py.is_voided
          and py.payment_date >= (b.today::timestamp at time zone b.timezone)
          and py.payment_date < ((b.today + 1)::timestamp at time zone b.timezone)
          and (v_section = 'all' or m.section = v_section)
      ), 0),
      'new_members', (
        select count(*)
        from public.members m
        cross join bounds b
        where m.status <> 'archived'
          and m.join_date >= b.cycle_start
          and m.join_date < b.cycle_end_exclusive
          and (v_section = 'all' or m.section = v_section)
      ),
      'pending_complaints', (
        select count(*)
        from public.complaints_feedback cf
        where cf.status in ('new', 'reviewing')
          and (
            v_section = 'all'
            or exists (
              select 1 from public.members m
              where m.id = cf.member_id and m.section = v_section
            )
          )
      ),
      'monthly_expenses', coalesce((
        select sum(e.amount) from public.expenses e, bounds b
        where not e.is_deleted
          and e.expense_date >= b.cycle_start
          and e.expense_date < b.cycle_end_exclusive
      ), 0),
      'net_profit', case when v_section = 'all' then
        coalesce((
          select sum(py.amount) from public.payments py, bounds b
          where not py.is_voided
            and py.payment_date >= (b.cycle_start::timestamp at time zone b.timezone)
            and py.payment_date < (b.cycle_end_exclusive::timestamp at time zone b.timezone)
        ), 0) - coalesce((
          select sum(e.amount) from public.expenses e, bounds b
          where not e.is_deleted
            and e.expense_date >= b.cycle_start
            and e.expense_date < b.cycle_end_exclusive
        ), 0)
        else null end
    ),
    'business_cycle', (
      select jsonb_build_object(
        'from', cycle_start,
        'to_exclusive', cycle_end_exclusive,
        'label', to_char(cycle_start, 'DD Mon') || ' – ' || to_char(cycle_end_exclusive - 1, 'DD Mon YYYY')
      ) from bounds
    ),
    'trend', (select value from trend),
    'membership_status', (
      select coalesce(jsonb_agg(jsonb_build_object('name', membership_status, 'value', amount)), '[]'::jsonb)
      from (
        select mo.membership_status, count(*) as amount
        from public.member_overview mo
        where v_section = 'all' or mo.section = v_section
        group by mo.membership_status
      ) x
    ),
    'payment_status', (
      select coalesce(jsonb_agg(jsonb_build_object('name', payment_status, 'value', amount)), '[]'::jsonb)
      from (
        select mo.payment_status, count(*) as amount
        from public.member_overview mo
        where v_section = 'all' or mo.section = v_section
        group by mo.payment_status
      ) x
    ),
    'recent_members', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select * from public.member_overview mo
        where v_section = 'all' or mo.section = v_section
        order by mo.created_at desc
        limit 5
      ) x
    ),
    'recent_payments', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select py.id, py.payment_number, py.payment_date, py.member_id,
          m.full_name as member_name, py.amount, 'paid' as status
        from public.payments py
        join public.members m on m.id = py.member_id
        where not py.is_voided and (v_section = 'all' or m.section = v_section)
        order by py.payment_date desc
        limit 5
      ) x
    ),
    'recent_expenses', (
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select e.id, e.expense_number, e.title, e.expense_date, e.amount, c.name as category_name
        from public.expenses e
        join public.expense_categories c on c.id = e.category_id
        where not e.is_deleted
        order by e.expense_date desc
        limit 5
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.dashboard_summary(integer, text) from public, anon;
grant execute on function public.dashboard_summary(integer, text) to authenticated;
