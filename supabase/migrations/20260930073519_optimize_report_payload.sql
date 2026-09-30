-- Keep the interactive reports page bounded as financial history grows. The
-- browser previously downloaded several complete tables and assembled the
-- report itself. This RPC performs the same aggregation in Postgres and only
-- returns the eight detail rows the page renders.
create or replace function public.report_details(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_role public.app_role := (select private.current_app_role());
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Invalid report date range' using errcode = '22007';
  end if;
  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with payments_in_range as materialized (
    select py.id, py.reporting_date, py.amount, py.member_id,
      m.full_name as member_name, mp.name as plan_name, pm.name as method_name
    from public.payments py
    join public.members m on m.id = py.member_id
    left join public.member_subscriptions ms on ms.id = py.subscription_id
    left join public.membership_plans mp on mp.id = ms.plan_id
    join public.payment_methods pm on pm.id = py.payment_method_id
    where not py.is_voided
      and py.reporting_date between p_from and p_to
  ), expenses_in_range as materialized (
    select e.id, e.expense_date, e.amount, e.title, e.description,
      e.category_id, ec.name as category_name
    from public.expenses e
    join public.expense_categories ec on ec.id = e.category_id
    where not e.is_deleted
      and e.expense_date between p_from and p_to
  ), daily as (
    select activity_date,
      sum(revenue) as revenue,
      sum(expenses) as expenses
    from (
      select reporting_date as activity_date, amount as revenue, 0::numeric as expenses
      from payments_in_range
      union all
      select expense_date, 0::numeric, amount
      from expenses_in_range
    ) activity
    group by activity_date
  ), expense_totals as (
    select category_id, category_name, sum(amount) as amount
    from expenses_in_range
    group by category_id, category_name
  ), plan_totals as (
    select ms.plan_id, mp.name, count(*) as amount
    from public.member_subscriptions ms
    join public.membership_plans mp on mp.id = ms.plan_id
    where ms.is_current and ms.status <> 'cancelled'
    group by ms.plan_id, mp.name
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(amount) from payments_in_range), 0),
    'expenses', coalesce((select sum(amount) from expenses_in_range), 0),
    'new_members', (
      select count(*) from public.members
      where status <> 'archived' and join_date between p_from and p_to
    ),
    'active_members', (
      select count(*) from public.member_overview where membership_status = 'active'
    ),
    'trend', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', activity_date,
        'revenue', revenue,
        'expenses', expenses
      ) order by activity_date), '[]'::jsonb)
      from daily
    ),
    'expense_categories', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', category_name,
        'amount', amount
      ) order by amount desc), '[]'::jsonb)
      from expense_totals
    ),
    'plans', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', name,
        'count', amount
      ) order by amount desc), '[]'::jsonb)
      from plan_totals
    ),
    'expiring_members', (
      select coalesce(jsonb_agg(to_jsonb(expiring)), '[]'::jsonb)
      from (
        select id, full_name as member, plan_name as plan, end_date as expiry
        from public.member_overview
        where membership_status = 'expiring_soon'
          and end_date is not null
          and end_date <= p_to
        order by end_date
        limit 8
      ) expiring
    ),
    'recent_payments', (
      select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
      from (
        select id, reporting_date as date, member_name as member,
          plan_name as plan, method_name as method, amount
        from payments_in_range
        order by reporting_date desc, id desc
        limit 8
      ) recent
    ),
    'recent_expenses', (
      select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
      from (
        select id, expense_date as date, category_name as category,
          coalesce(nullif(title, ''), nullif(description, ''), 'Expense') as description,
          amount
        from expenses_in_range
        order by expense_date desc, id desc
        limit 8
      ) recent
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.report_details(date, date) from public, anon;
grant execute on function public.report_details(date, date) to authenticated;

-- Extend the existing bounded summary response so payment and expense cards do
-- not need extra count queries or download every expense amount to aggregate it
-- in the browser.
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
    ), 0),
    'paid_members', (
      select count(*) from public.member_overview where payment_status = 'paid'
    ),
    'unpaid_members', (
      select count(*) from public.member_overview where payment_status in ('partial', 'unpaid')
    ),
    'largest_expense_category', coalesce((
      select ec.name
      from public.expenses e
      join public.expense_categories ec on ec.id = e.category_id
      where not e.is_deleted and e.expense_date between p_from and p_to
      group by ec.id, ec.name
      order by sum(e.amount) desc, ec.name
      limit 1
    ), '—')
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.report_summary(date, date) from public, anon;
grant execute on function public.report_summary(date, date) to authenticated;
