-- Lock the Data API to authenticated, active FITX staff.
-- Authorization is derived from public.profiles, not user-editable JWT metadata.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and is_active
    );
$$;

create or replace function private.has_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and is_active
        and role = any(allowed_roles)
    );
$$;

revoke all on function private.is_active_staff() from public, anon;
revoke all on function private.has_role(public.app_role[]) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.has_role(public.app_role[]) to authenticated;

-- Anonymous browser clients must not have direct table or sequence access.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Authenticated users receive only the table privileges used by the app. RLS
-- below further restricts every operation by active status and business role.
grant select on public.profiles, public.membership_plans, public.payment_methods,
  public.expense_categories, public.gym_settings, public.members,
  public.member_subscriptions, public.payments, public.membership_renewals,
  public.expenses, public.staff, public.equipment, public.complaints_feedback,
  public.notifications, public.reminder_settings, public.reminder_logs,
  public.audit_logs to authenticated;

grant insert, update on public.members, public.member_subscriptions to authenticated;
grant delete on public.members, public.member_subscriptions to authenticated;
grant update on public.profiles to authenticated;
grant insert on public.payments, public.membership_renewals to authenticated;
grant update on public.payments to authenticated;
grant insert, update, delete on public.membership_plans, public.payment_methods,
  public.expense_categories, public.expenses, public.staff, public.equipment,
  public.complaints_feedback, public.reminder_settings to authenticated;
grant update on public.gym_settings, public.notifications to authenticated;
grant insert, update on public.reminder_logs to authenticated;
grant usage, select on public.member_code_seq, public.payment_number_seq,
  public.expense_number_seq to authenticated;

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.membership_plans enable row level security;
alter table public.payment_methods enable row level security;
alter table public.expense_categories enable row level security;
alter table public.gym_settings enable row level security;
alter table public.members enable row level security;
alter table public.member_subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.membership_renewals enable row level security;
alter table public.expenses enable row level security;
alter table public.staff enable row level security;
alter table public.equipment enable row level security;
alter table public.complaints_feedback enable row level security;
alter table public.notifications enable row level security;
alter table public.reminder_settings enable row level security;
alter table public.reminder_logs enable row level security;

create policy profiles_select_active_staff
on public.profiles for select to authenticated
using ((select private.is_active_staff()) or id = (select auth.uid()));

create policy profiles_update_owner
on public.profiles for update to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy audit_logs_select_privileged
on public.audit_logs for select to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy membership_plans_select_staff
on public.membership_plans for select to authenticated
using ((select private.is_active_staff()));
create policy membership_plans_write_owner
on public.membership_plans for all to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy payment_methods_select_staff
on public.payment_methods for select to authenticated
using ((select private.is_active_staff()));
create policy payment_methods_write_owner
on public.payment_methods for all to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy expense_categories_select_privileged
on public.expense_categories for select to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])));
create policy expense_categories_write_owner
on public.expense_categories for all to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy gym_settings_select_staff
on public.gym_settings for select to authenticated
using ((select private.is_active_staff()));
create policy gym_settings_update_owner
on public.gym_settings for update to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy members_select_staff
on public.members for select to authenticated
using ((select private.is_active_staff()));
create policy members_insert_staff
on public.members for insert to authenticated
with check ((select private.is_active_staff()));
create policy members_update_staff
on public.members for update to authenticated
using ((select private.is_active_staff()))
with check ((select private.is_active_staff()));
create policy members_delete_privileged
on public.members for delete to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy member_subscriptions_select_staff
on public.member_subscriptions for select to authenticated
using ((select private.is_active_staff()));
create policy member_subscriptions_insert_staff
on public.member_subscriptions for insert to authenticated
with check ((select private.is_active_staff()));
create policy member_subscriptions_update_staff
on public.member_subscriptions for update to authenticated
using ((select private.is_active_staff()))
with check ((select private.is_active_staff()));
create policy member_subscriptions_delete_privileged
on public.member_subscriptions for delete to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy payments_select_staff
on public.payments for select to authenticated
using ((select private.is_active_staff()));
create policy payments_insert_staff
on public.payments for insert to authenticated
with check ((select private.is_active_staff()));
create policy payments_update_privileged
on public.payments for update to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])))
with check ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy membership_renewals_select_staff
on public.membership_renewals for select to authenticated
using ((select private.is_active_staff()));
create policy membership_renewals_insert_staff
on public.membership_renewals for insert to authenticated
with check ((select private.is_active_staff()));

create policy expenses_select_privileged
on public.expenses for select to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])));
create policy expenses_write_privileged
on public.expenses for all to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])))
with check ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy staff_owner_access
on public.staff for all to authenticated
using ((select private.has_role(array['owner']::public.app_role[])))
with check ((select private.has_role(array['owner']::public.app_role[])));

create policy equipment_select_staff
on public.equipment for select to authenticated
using ((select private.is_active_staff()));
create policy equipment_write_privileged
on public.equipment for all to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])))
with check ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy complaints_select_staff
on public.complaints_feedback for select to authenticated
using ((select private.is_active_staff()));
create policy complaints_write_staff
on public.complaints_feedback for all to authenticated
using ((select private.is_active_staff()))
with check ((select private.is_active_staff()));

create policy notifications_select_own
on public.notifications for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_staff()));
create policy notifications_update_own
on public.notifications for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_staff()))
with check (user_id = (select auth.uid()) and (select private.is_active_staff()));

create policy reminder_settings_privileged
on public.reminder_settings for all to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])))
with check ((select private.has_role(array['owner', 'admin']::public.app_role[])));

create policy reminder_logs_privileged
on public.reminder_logs for all to authenticated
using ((select private.has_role(array['owner', 'admin']::public.app_role[])))
with check ((select private.has_role(array['owner', 'admin']::public.app_role[])));
