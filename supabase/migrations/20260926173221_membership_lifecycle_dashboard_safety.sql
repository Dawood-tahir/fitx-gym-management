-- Additive production-safe lifecycle improvements.  This migration does not
-- delete, rewrite, reseed, or require re-entry of any existing records.

-- A presentation/source-of-truth view: dates, payments and member status are
-- evaluated together so an unpaid term cannot appear as active.
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
) clock;

-- Reuses existing immutable records to provide a manager-readable timeline.
-- It deliberately does not backfill or mutate history.
create or replace function public.member_timeline(p_member_id uuid)
returns table(event_at timestamptz, event_type text, title text, detail text, amount numeric, subscription_id uuid, payment_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.created_at, 'member_created', 'Member created', m.member_code, null::numeric, null::uuid, null::uuid
  from public.members m where m.id = p_member_id
  union all
  select s.created_at, 'membership_started', 'Membership started', coalesce(p.name, 'Membership'), s.final_amount, s.id, null::uuid
  from public.member_subscriptions s join public.membership_plans p on p.id = s.plan_id
  where s.member_id = p_member_id
  union all
  select r.created_at, 'membership_renewed', 'Membership renewed', coalesce(p.name, 'Membership'), s.final_amount, s.id, r.payment_id
  from public.membership_renewals r
  join public.member_subscriptions s on s.id = r.new_subscription_id
  join public.membership_plans p on p.id = s.plan_id
  where r.member_id = p_member_id
  union all
  select py.payment_date, case when py.is_voided then 'payment_voided' else 'payment_received' end,
    case when py.is_voided then 'Payment voided' else 'Payment received' end,
    py.payment_number, py.amount, py.subscription_id, py.id
  from public.payments py where py.member_id = p_member_id
  union all
  select a.created_at, 'member_updated', 'Member profile updated', a.action, null::numeric, null::uuid, null::uuid
  from public.audit_logs a where a.entity_type = 'members' and a.entity_id = p_member_id::text and a.action = 'members_update'
  order by 1 desc;
$$;

revoke all on function public.member_timeline(uuid) from public, anon;
grant execute on function public.member_timeline(uuid) to authenticated;

-- The 10th-to-9th business cycle is calculated in the configured gym timezone.
create or replace function public.dashboard_summary(p_months integer default 6)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with settings as (
  select coalesce((select timezone from public.gym_settings where singleton), 'Asia/Karachi') as timezone
), clock as (
  select timezone, (now() at time zone timezone)::date as today from settings
), cycle as (
  select timezone, today,
    case when extract(day from today) >= 10
      then make_date(extract(year from today)::int, extract(month from today)::int, 10)
      else (make_date(extract(year from today)::int, extract(month from today)::int, 10) - interval '1 month')::date end as cycle_start
  from clock
), bounds as (
  select *, (cycle_start + interval '1 month')::date as cycle_end_exclusive,
    (cycle_start - make_interval(months => greatest(1, least(coalesce(p_months, 6), 24)) - 1))::date as first_month
  from cycle
), months as (
  select generate_series(first_month, cycle_start, interval '1 month')::date as month_start, timezone from bounds
), trend as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'label', to_char(month_start, 'Mon YY'),
    'revenue', coalesce((select sum(amount) from public.payments where not is_voided and payment_date >= (month_start::timestamp at time zone timezone) and payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)), 0),
    'expenses', coalesce((select sum(amount) from public.expenses where not is_deleted and expense_date >= month_start and expense_date < month_start + interval '1 month'), 0),
    'profit', coalesce((select sum(amount) from public.payments where not is_voided and payment_date >= (month_start::timestamp at time zone timezone) and payment_date < ((month_start + interval '1 month')::timestamp at time zone timezone)), 0) - coalesce((select sum(amount) from public.expenses where not is_deleted and expense_date >= month_start and expense_date < month_start + interval '1 month'), 0),
    'new_members', (select count(*) from public.members where join_date >= month_start and join_date < month_start + interval '1 month')
  ) order by month_start), '[]'::jsonb) value from months
)
select jsonb_build_object(
  'metrics', jsonb_build_object(
    'total_members', (select count(*) from public.members where status <> 'archived'),
    'active_members', (select count(*) from public.member_overview where membership_status = 'active'),
    'expiring_soon', (select count(*) from public.member_overview where membership_status = 'expiring_soon'),
    'expired_members', (select count(*) from public.member_overview where membership_status = 'expired'),
    'payment_due_members', (select count(*) from public.member_overview where membership_status = 'payment_due'),
    'unpaid_fees', (select count(*) from public.member_overview where payment_status in ('partial','unpaid')),
    'monthly_revenue', coalesce((select sum(amount) from public.payments, bounds where not is_voided and payment_date >= (cycle_start::timestamp at time zone timezone) and payment_date < (cycle_end_exclusive::timestamp at time zone timezone)), 0),
    'revenue_today', coalesce((select sum(amount) from public.payments, bounds where not is_voided and payment_date >= (today::timestamp at time zone timezone) and payment_date < ((today + 1)::timestamp at time zone timezone)), 0),
    'monthly_expenses', coalesce((select sum(amount) from public.expenses, bounds where not is_deleted and expense_date >= cycle_start and expense_date < cycle_end_exclusive), 0),
    'net_profit', coalesce((select sum(amount) from public.payments, bounds where not is_voided and payment_date >= (cycle_start::timestamp at time zone timezone) and payment_date < (cycle_end_exclusive::timestamp at time zone timezone)), 0) - coalesce((select sum(amount) from public.expenses, bounds where not is_deleted and expense_date >= cycle_start and expense_date < cycle_end_exclusive), 0)
  ),
  'business_cycle', (select jsonb_build_object('from', cycle_start, 'to_exclusive', cycle_end_exclusive, 'label', to_char(cycle_start, 'DD Mon') || ' – ' || to_char(cycle_end_exclusive - 1, 'DD Mon YYYY')) from bounds),
  'trend', (select value from trend),
  'membership_status', (select coalesce(jsonb_agg(jsonb_build_object('name', membership_status, 'value', amount)), '[]'::jsonb) from (select membership_status, count(*) amount from public.member_overview group by membership_status) x),
  'payment_status', (select coalesce(jsonb_agg(jsonb_build_object('name', payment_status, 'value', amount)), '[]'::jsonb) from (select payment_status, count(*) amount from public.member_overview group by payment_status) x),
  'plan_distribution', (select coalesce(jsonb_agg(jsonb_build_object('name', plan_name, 'value', amount)), '[]'::jsonb) from (select coalesce(plan_name,'No plan') plan_name, count(*) amount from public.member_overview group by plan_name) x),
  'recent_members', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (select * from public.member_overview order by created_at desc limit 5) x),
  'recent_payments', (select coalesce(jsonb_agg(jsonb_build_object('id', py.id, 'payment_number', py.payment_number, 'payment_date', py.payment_date, 'member_id', py.member_id, 'member_name', m.full_name, 'amount', py.amount, 'status', 'paid')), '[]'::jsonb) from (select * from public.payments where not is_voided order by payment_date desc limit 5) py join public.members m on m.id = py.member_id),
  'recent_expenses', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'expense_number', e.expense_number, 'title', e.title, 'expense_date', e.expense_date, 'amount', e.amount, 'category_name', c.name)), '[]'::jsonb) from (select * from public.expenses where not is_deleted order by expense_date desc limit 5) e join public.expense_categories c on c.id = e.category_id)
);
$$;

-- Manager permissions are operational but deliberately exclude staff accounts,
-- owner settings and payment voiding. Reception remains limited to member and
-- payment workflows by the existing policies.
drop policy if exists expenses_select_privileged on public.expenses;
create policy expenses_select_privileged on public.expenses for select to authenticated
using ((select private.has_role(array['owner','admin','manager']::public.app_role[])));
drop policy if exists expenses_write_privileged on public.expenses;
create policy expenses_write_privileged on public.expenses for all to authenticated
using ((select private.has_role(array['owner','admin','manager']::public.app_role[])))
with check ((select private.has_role(array['owner','admin','manager']::public.app_role[])));
drop policy if exists equipment_write_privileged on public.equipment;
create policy equipment_write_privileged on public.equipment for all to authenticated
using ((select private.has_role(array['owner','admin','manager']::public.app_role[])))
with check ((select private.has_role(array['owner','admin','manager']::public.app_role[])));
