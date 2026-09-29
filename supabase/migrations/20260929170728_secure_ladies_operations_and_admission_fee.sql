-- Tighten section-scoped reception access, add auditable membership-date
-- changes, and introduce the optional one-time admission fee.

alter table public.members
  add column admission_fee_status text not null default 'legacy_paid',
  add column admission_fee_paid_at timestamptz;

alter table public.members
  add constraint members_admission_fee_status_check
    check (admission_fee_status in ('paid', 'waived', 'legacy_paid')),
  add constraint members_admission_fee_state_check
    check (
      (admission_fee_status = 'paid' and admission_fee_paid_at is not null)
      or (admission_fee_status in ('waived', 'legacy_paid') and admission_fee_paid_at is null)
    );

alter table public.payments
  drop constraint if exists payments_payment_type_check;

alter table public.payments
  add constraint payments_payment_type_check
    check (payment_type in ('membership', 'renewal', 'registration', 'admission_fee', 'other')),
  add constraint payments_admission_fee_shape_check
    check (payment_type <> 'admission_fee' or (amount = 500 and subscription_id is null));

create unique index payments_one_admission_fee_per_member_uidx
  on public.payments (member_id)
  where payment_type = 'admission_fee';

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active;
$$;

create or replace function private.can_access_member_section(p_section text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_app_role()) is not null
    and (
      (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
      or p_section = 'ladies'
    ),
    false
  );
$$;

create or replace function private.can_access_member(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_app_role()) is not null
    and (
      (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
      or exists (
        select 1
        from public.members m
        where m.id = p_member_id
          and m.section = 'ladies'
      )
    ),
    false
  );
$$;

create or replace function private.can_access_member_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_app_role()) is not null
    and (
      (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
      or exists (
        select 1
        from public.members m
        where m.profile_photo_path = p_path
          and m.section = 'ladies'
      )
    ),
    false
  );
$$;

revoke all on function private.current_app_role() from public, anon;
revoke all on function private.can_access_member_section(text) from public, anon;
revoke all on function private.can_access_member(uuid) from public, anon;
revoke all on function private.can_access_member_photo(text) from public, anon;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.can_access_member_section(text) to authenticated;
grant execute on function private.can_access_member(uuid) to authenticated;
grant execute on function private.can_access_member_photo(text) to authenticated;

create or replace function private.validate_member_admission_fee_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    and new.admission_fee_status <> 'legacy_paid'
    and coalesce(current_setting('fitx.admission_fee_creation', true), '') <> 'on'
  then
    raise exception 'Admission fee status can only be set during member creation'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
    and (
      new.admission_fee_status is distinct from old.admission_fee_status
      or new.admission_fee_paid_at is distinct from old.admission_fee_paid_at
    )
  then
    raise exception 'Admission fee status is immutable after member creation'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger members_validate_admission_fee_state
before insert or update of admission_fee_status, admission_fee_paid_at on public.members
for each row execute function private.validate_member_admission_fee_state();

create or replace function private.validate_admission_fee_payment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.payment_type <> 'admission_fee' then
    return new;
  end if;

  if tg_op = 'INSERT'
    and coalesce(current_setting('fitx.admission_fee_creation', true), '') <> 'on'
  then
    raise exception 'Admission fee payments can only be created with a new member'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.member_id is distinct from old.member_id
    or new.subscription_id is distinct from old.subscription_id
    or new.amount is distinct from old.amount
    or new.payment_type is distinct from old.payment_type
  ) then
    raise exception 'Admission fee payment details are immutable'
      using errcode = '42501';
  end if;

  select m.admission_fee_status
  into v_status
  from public.members m
  where m.id = new.member_id;

  if v_status <> 'paid' then
    raise exception 'Member admission fee is not marked paid'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger payments_validate_admission_fee
before insert or update of member_id, subscription_id, amount, payment_type on public.payments
for each row execute function private.validate_admission_fee_payment();

revoke all on function private.validate_member_admission_fee_state() from public, anon, authenticated;
revoke all on function private.validate_admission_fee_payment() from public, anon, authenticated;

-- Existing memberships may use a plan that has since been deactivated. Date
-- correction keeps that plan and its original duration, while new terms still
-- require an active plan.
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

  select join_date into v_join_date
  from public.members
  where id = new.member_id;

  if v_join_date is null then
    raise exception 'Member not found' using errcode = '23503';
  end if;
  if new.start_date < v_join_date then
    raise exception 'Membership cannot start before the member join date' using errcode = '23514';
  end if;

  select duration_months into v_duration
  from public.membership_plans
  where id = new.plan_id
    and (
      is_active
      or (tg_op = 'UPDATE' and new.plan_id is not distinct from old.plan_id)
    );

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

-- Append admission fields after the existing view columns to preserve the
-- current PostgREST response shape.
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
  m.section,
  m.admission_fee_status,
  m.admission_fee_paid_at
from public.members m
left join public.member_subscriptions s
  on s.member_id = m.id and s.is_current and s.status <> 'cancelled'
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

-- Ladies reception can only see and mutate ladies-linked operational rows.
drop policy if exists members_select_staff on public.members;
drop policy if exists members_insert_staff on public.members;
drop policy if exists members_update_staff on public.members;
create policy members_select_staff on public.members for select to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member_section(section)));
create policy members_insert_staff on public.members for insert to authenticated
with check (
  (select private.is_active_staff())
  and (select private.can_access_member_section(section))
  and admission_fee_status in ('paid', 'waived')
);
create policy members_update_staff on public.members for update to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member_section(section)))
with check ((select private.is_active_staff()) and (select private.can_access_member_section(section)));

drop policy if exists member_subscriptions_select_staff on public.member_subscriptions;
drop policy if exists member_subscriptions_insert_staff on public.member_subscriptions;
drop policy if exists member_subscriptions_update_staff on public.member_subscriptions;
create policy member_subscriptions_select_staff on public.member_subscriptions for select to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member(member_id)));
create policy member_subscriptions_insert_staff on public.member_subscriptions for insert to authenticated
with check ((select private.is_active_staff()) and (select private.can_access_member(member_id)));
create policy member_subscriptions_update_staff on public.member_subscriptions for update to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member(member_id)))
with check ((select private.is_active_staff()) and (select private.can_access_member(member_id)));

drop policy if exists payments_select_staff on public.payments;
drop policy if exists payments_insert_staff on public.payments;
create policy payments_select_staff on public.payments for select to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member(member_id)));
create policy payments_insert_staff on public.payments for insert to authenticated
with check ((select private.is_active_staff()) and (select private.can_access_member(member_id)));

drop policy if exists membership_renewals_select_staff on public.membership_renewals;
drop policy if exists membership_renewals_insert_staff on public.membership_renewals;
create policy membership_renewals_select_staff on public.membership_renewals for select to authenticated
using ((select private.is_active_staff()) and (select private.can_access_member(member_id)));
create policy membership_renewals_insert_staff on public.membership_renewals for insert to authenticated
with check ((select private.is_active_staff()) and (select private.can_access_member(member_id)));

drop policy if exists complaints_select_staff on public.complaints_feedback;
drop policy if exists complaints_insert_staff on public.complaints_feedback;
drop policy if exists complaints_update_staff on public.complaints_feedback;
drop policy if exists complaints_delete_staff on public.complaints_feedback;
create policy complaints_select_staff on public.complaints_feedback for select to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or (member_id is not null and (select private.can_access_member(member_id)))
  )
);
create policy complaints_insert_staff on public.complaints_feedback for insert to authenticated
with check (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or (member_id is not null and (select private.can_access_member(member_id)))
  )
);
create policy complaints_update_staff on public.complaints_feedback for update to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or (member_id is not null and (select private.can_access_member(member_id)))
  )
)
with check (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or (member_id is not null and (select private.can_access_member(member_id)))
  )
);
create policy complaints_delete_staff on public.complaints_feedback for delete to authenticated
using (
  (select private.is_active_staff())
  and (
    (select private.current_app_role()) <> 'ladies_receptionist'::public.app_role
    or (member_id is not null and (select private.can_access_member(member_id)))
  )
);

-- Normal reception receives the complete existing expense workflow. Ladies
-- reception is deliberately excluded from expenses and categories.
drop policy if exists expense_categories_select_privileged on public.expense_categories;
create policy expense_categories_select_privileged on public.expense_categories for select to authenticated
using ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])));

drop policy if exists expenses_select_privileged on public.expenses;
drop policy if exists expenses_write_privileged on public.expenses;
drop policy if exists expenses_insert_privileged on public.expenses;
drop policy if exists expenses_update_privileged on public.expenses;
drop policy if exists expenses_delete_privileged on public.expenses;
create policy expenses_select_privileged on public.expenses for select to authenticated
using ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])));
create policy expenses_insert_privileged on public.expenses for insert to authenticated
with check ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])));
create policy expenses_update_privileged on public.expenses for update to authenticated
using ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])))
with check ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])));
create policy expenses_delete_privileged on public.expenses for delete to authenticated
using ((select private.has_role(array['owner','admin','manager','receptionist']::public.app_role[])));

drop policy if exists fitx_images_select on storage.objects;
create policy fitx_images_select on storage.objects for select to authenticated
using (
  bucket_id in ('member-photos','staff-photos','gym-assets')
  and (select private.is_active_staff())
  and (
    bucket_id <> 'member-photos'
    or (select private.can_access_member_photo(name))
  )
);

drop function if exists public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid, text
);

create function public.create_member_with_membership(
  p_full_name text, p_phone text, p_join_date date, p_plan_id uuid,
  p_start_date date, p_amount numeric, p_email text default null,
  p_national_id text default null, p_gender text default null,
  p_date_of_birth date default null, p_address text default null,
  p_emergency_contact_name text default null, p_emergency_contact_phone text default null,
  p_notes text default null, p_profile_photo_path text default null,
  p_discount numeric default 0, p_amount_paid numeric default 0,
  p_payment_method_id uuid default null, p_section text default null,
  p_add_admission_fee boolean default true
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
  v_role public.app_role;
begin
  v_role := (select private.current_app_role());
  if v_role is null then
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

  v_section := coalesce(
    lower(nullif(btrim(p_section), '')),
    case lower(p_gender) when 'male' then 'gents' when 'female' then 'ladies' end
  );
  if v_section is null or v_section not in ('gents', 'ladies') then
    raise exception 'A valid gym section is required' using errcode = '23514';
  end if;
  if v_role = 'ladies_receptionist' and v_section <> 'ladies' then
    raise exception 'Ladies reception can only create ladies members' using errcode = '42501';
  end if;

  if (p_amount_paid > 0 or p_add_admission_fee) and p_payment_method_id is null then
    raise exception 'Payment method is required' using errcode = '23514';
  end if;
  if (p_amount_paid > 0 or p_add_admission_fee) and not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and is_active
  ) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;

  select duration_months into v_duration
  from public.membership_plans
  where id = p_plan_id and is_active;
  if v_duration is null then
    raise exception 'Active membership plan not found' using errcode = '23503';
  end if;

  v_end_date := (p_start_date + make_interval(months => v_duration) - interval '1 day')::date;
  perform pg_catalog.set_config('fitx.admission_fee_creation', 'on', true);

  insert into public.members(
    full_name, phone, email, national_id, gender, section, date_of_birth, address,
    emergency_contact_name, emergency_contact_phone, join_date, notes, profile_photo_path,
    admission_fee_status, admission_fee_paid_at
  ) values (
    p_full_name, p_phone, p_email, p_national_id, p_gender, v_section, p_date_of_birth, p_address,
    p_emergency_contact_name, p_emergency_contact_phone, p_join_date, p_notes, p_profile_photo_path,
    case when p_add_admission_fee then 'paid' else 'waived' end,
    case when p_add_admission_fee then now() else null end
  ) returning id into v_member_id;

  insert into public.member_subscriptions(member_id, plan_id, start_date, end_date, amount, discount)
  values (v_member_id, p_plan_id, p_start_date, v_end_date, p_amount, p_discount)
  returning id into v_subscription_id;

  if p_amount_paid > 0 then
    insert into public.payments(member_id, subscription_id, amount, payment_method_id, payment_type)
    values (v_member_id, v_subscription_id, p_amount_paid, p_payment_method_id, 'registration');
  end if;

  if p_add_admission_fee then
    insert into public.payments(
      member_id, subscription_id, amount, payment_method_id, payment_type, notes
    ) values (
      v_member_id, null, 500, p_payment_method_id, 'admission_fee', 'Admission Fee'
    );
  end if;

  return v_member_id;
end;
$$;

revoke all on function public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid, text, boolean
) from public, anon;
grant execute on function public.create_member_with_membership(
  text, text, date, uuid, date, numeric, text, text, text, date, text,
  text, text, text, text, numeric, numeric, uuid, text, boolean
) to authenticated;

create or replace function public.record_payment(
  p_member_id uuid, p_amount numeric, p_payment_method_id uuid, p_payment_date timestamptz,
  p_subscription_id uuid default null, p_payment_type text default 'membership',
  p_reference_number text default null, p_notes text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_due numeric;
  v_paid numeric;
begin
  if not (select private.is_active_staff())
    or not (select private.can_access_member(p_member_id))
  then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_payment_type = 'admission_fee' then
    raise exception 'Admission fee can only be recorded during member creation' using errcode = '42501';
  end if;
  if p_payment_type not in ('membership', 'renewal', 'registration', 'other') then
    raise exception 'Invalid payment type' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and is_active
  ) then
    raise exception 'Active payment method not found' using errcode = '23503';
  end if;
  if p_subscription_id is not null then
    select final_amount into v_due
    from public.member_subscriptions
    where id = p_subscription_id and member_id = p_member_id
    for update;
    if v_due is null then
      raise exception 'Membership not found for member' using errcode = '23503';
    end if;
    select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where subscription_id = p_subscription_id and not is_voided;
    if v_paid + p_amount > v_due then
      raise exception 'Payment exceeds outstanding balance' using errcode = '23514';
    end if;
  end if;

  insert into public.payments(
    member_id, subscription_id, amount, payment_method_id, payment_date,
    payment_type, reference_number, notes
  ) values (
    p_member_id, p_subscription_id, p_amount, p_payment_method_id, coalesce(p_payment_date, now()),
    p_payment_type, p_reference_number, p_notes
  ) returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create or replace function public.change_membership_start_date(
  p_member_id uuid,
  p_new_start_date date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_plan_id uuid;
  v_join_date date;
  v_old_start date;
  v_old_end date;
  v_new_end date;
  v_duration integer;
begin
  if not (select private.is_active_staff())
    or not (select private.can_access_member(p_member_id))
  then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_new_start_date is null then
    raise exception 'Membership start date is required' using errcode = '23514';
  end if;

  select s.id, s.plan_id, s.start_date, s.end_date, m.join_date
  into v_subscription_id, v_plan_id, v_old_start, v_old_end, v_join_date
  from public.member_subscriptions s
  join public.members m on m.id = s.member_id
  where s.member_id = p_member_id
    and s.is_current
    and s.status <> 'cancelled'
  for update of s;

  if v_subscription_id is null then
    raise exception 'Current membership not found' using errcode = 'P0002';
  end if;
  if p_new_start_date < v_join_date then
    raise exception 'Membership cannot start before the member join date' using errcode = '23514';
  end if;

  select duration_months into v_duration
  from public.membership_plans
  where id = v_plan_id;
  if v_duration is null then
    raise exception 'Membership plan not found' using errcode = '23503';
  end if;

  v_new_end := (p_new_start_date + make_interval(months => v_duration) - interval '1 day')::date;
  update public.member_subscriptions
  set start_date = p_new_start_date,
      end_date = v_new_end
  where id = v_subscription_id;

  return jsonb_build_object(
    'subscription_id', v_subscription_id,
    'old_start_date', v_old_start,
    'new_start_date', p_new_start_date,
    'old_end_date', v_old_end,
    'new_end_date', v_new_end,
    'changed_by', (select auth.uid()),
    'changed_at', now()
  );
end;
$$;

revoke all on function public.change_membership_start_date(uuid, date) from public, anon;
grant execute on function public.change_membership_start_date(uuid, date) to authenticated;

-- Keep one parameterized dashboard RPC. Ladies reception is forced to the
-- ladies section at the database boundary and cannot request whole-gym data.
create or replace function public.dashboard_summary(
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
  v_role public.app_role := (select private.current_app_role());
  v_result jsonb;
begin
  if v_role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_section not in ('all', 'gents', 'ladies') then
    raise exception 'Invalid dashboard section' using errcode = '22023';
  end if;
  if v_role = 'ladies_receptionist' and v_section <> 'ladies' then
    raise exception 'Ladies reception can only access the ladies dashboard' using errcode = '42501';
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
          m.full_name as member_name, py.amount, py.payment_type, 'paid' as status
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
