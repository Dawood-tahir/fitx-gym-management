-- Keep renewal terms continuous so late payments do not move the member's
-- established expiry day. The payment/renewal date remains recorded separately.

create or replace function public.renew_membership(
  p_member_id uuid, p_plan_id uuid, p_renewal_date date, p_amount numeric,
  p_discount numeric default 0, p_amount_paid numeric default 0,
  p_payment_method_id uuid default null, p_reference_number text default null,
  p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous uuid;
  v_previous_end date;
  v_new uuid;
  v_payment uuid;
  v_duration integer;
  v_start date;
  v_end date;
begin
  if not (select private.is_active_staff()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_renewal_date is null then
    raise exception 'Renewal date is required' using errcode = '23514';
  end if;
  if p_amount is null or p_amount < 0 or p_discount is null or p_discount < 0 or p_discount > p_amount then
    raise exception 'Invalid membership amount or discount' using errcode = '23514';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > p_amount - p_discount then
    raise exception 'Invalid renewal payment' using errcode = '23514';
  end if;
  if p_amount_paid > 0 and p_payment_method_id is null then
    raise exception 'Payment method is required' using errcode = '23514';
  end if;
  if p_amount_paid > 0 and not exists (
    select 1
    from public.payment_methods
    where id = p_payment_method_id and is_active
  ) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;

  select id, end_date
  into v_previous, v_previous_end
  from public.member_subscriptions
  where member_id = p_member_id and is_current and status <> 'cancelled'
  for update;

  if v_previous is null then
    raise exception 'Current membership not found' using errcode = '23503';
  end if;

  select duration_months
  into v_duration
  from public.membership_plans
  where id = p_plan_id and is_active;

  if v_duration is null then
    raise exception 'Active membership plan not found' using errcode = '23503';
  end if;

  -- Renewal entry/payment may be late, but the next term always continues from
  -- the prior term so the established billing anniversary does not drift.
  v_start := v_previous_end + 1;
  v_end := (v_start + make_interval(months => v_duration) - interval '1 day')::date;

  update public.member_subscriptions
  set is_current = false
  where id = v_previous;

  insert into public.member_subscriptions(
    member_id, plan_id, start_date, end_date, amount, discount, notes
  ) values (
    p_member_id, p_plan_id, v_start, v_end, p_amount, p_discount, p_notes
  ) returning id into v_new;

  if p_amount_paid > 0 then
    insert into public.payments(
      member_id, subscription_id, amount, payment_method_id, payment_date,
      payment_type, reference_number, notes
    ) values (
      p_member_id, v_new, p_amount_paid, p_payment_method_id, now(),
      'renewal', p_reference_number, p_notes
    ) returning id into v_payment;
  end if;

  insert into public.membership_renewals(
    member_id, previous_subscription_id, new_subscription_id, renewal_date, payment_id
  ) values (
    p_member_id, v_previous, v_new, p_renewal_date, v_payment
  );

  return v_new;
end;
$$;

revoke all on function public.renew_membership(uuid,uuid,date,numeric,numeric,numeric,uuid,text,text)
  from public, anon;
grant execute on function public.renew_membership(uuid,uuid,date,numeric,numeric,numeric,uuid,text,text)
  to authenticated;
