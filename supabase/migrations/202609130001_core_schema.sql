-- FITX core Supabase/PostgreSQL schema.
-- This migration deliberately contains no users, credentials, or personal seed data.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists btree_gist with schema extensions;

do $$
begin
  create type public.app_role as enum ('owner', 'admin', 'manager', 'receptionist');
exception
  when duplicate_object then null;
end
$$;

create sequence public.member_code_seq as bigint start with 1 increment by 1 no cycle;
create sequence public.payment_number_seq as bigint start with 1 increment by 1 no cycle;
create sequence public.expense_number_seq as bigint start with 1 increment by 1 no cycle;

create or replace function public.next_member_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'FITX-' || lpad(nextval('public.member_code_seq')::text, 4, '0');
$$;

create or replace function public.next_payment_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'PAY-' || lpad(nextval('public.payment_number_seq')::text, 8, '0');
$$;

create or replace function public.next_expense_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'EXP-' || lpad(nextval('public.expense_number_seq')::text, 8, '0');
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (char_length(email) <= 254 and position('@' in email) > 1),
  role public.app_role not null default 'receptionist',
  phone text check (phone is null or char_length(phone) <= 30),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 500),
  is_active boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_email_lower_uidx on public.profiles (lower(email));
create index profiles_role_active_idx on public.profiles (role, is_active) where is_active;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 2 and 120),
  entity_type text not null check (char_length(entity_type) between 2 and 120),
  entity_id text check (entity_id is null or char_length(entity_id) <= 120),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_user_idx on public.audit_logs (user_id, created_at desc) where user_id is not null;

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 1000),
  duration_months smallint not null check (duration_months between 1 and 120),
  price numeric(12,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index membership_plans_name_lower_uidx on public.membership_plans (lower(name));
create index membership_plans_active_price_idx on public.membership_plans (is_active, price, name);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index payment_methods_name_lower_uidx on public.payment_methods (lower(name));
create index payment_methods_active_name_idx on public.payment_methods (is_active, name);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  is_active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index expense_categories_name_lower_uidx on public.expense_categories (lower(name));
create index expense_categories_active_name_idx on public.expense_categories (is_active, name);

create table public.gym_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true check (singleton),
  gym_name text not null default 'FitX' check (char_length(btrim(gym_name)) between 2 and 120),
  logo_path text check (logo_path is null or char_length(logo_path) <= 500),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or (char_length(email) <= 254 and position('@' in email) > 1)),
  address text check (address is null or char_length(address) <= 1000),
  currency text not null default 'PKR' check (currency = upper(currency) and char_length(currency) = 3),
  timezone text not null default 'Asia/Karachi' check (char_length(timezone) between 1 and 80),
  default_locale text not null default 'en' check (default_locale in ('en', 'ur')),
  membership_expiry_warning_days smallint not null default 7 check (membership_expiry_warning_days between 1 and 90),
  high_expense_threshold numeric(12,2) not null default 50000 check (high_expense_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gym_settings_singleton_key unique (singleton)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null default public.next_member_code() check (char_length(member_code) between 6 and 32),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 5 and 30),
  email text check (email is null or (char_length(email) <= 254 and position('@' in email) > 1)),
  national_id text check (national_id is null or char_length(national_id) <= 40),
  gender text check (gender is null or char_length(gender) <= 30),
  date_of_birth date,
  address text check (address is null or char_length(address) <= 1000),
  emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 30),
  join_date date not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'suspended', 'archived')),
  notes text check (notes is null or char_length(notes) <= 4000),
  profile_photo_path text check (profile_photo_path is null or char_length(profile_photo_path) <= 500),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_archive_state_ck check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  )
);

create unique index members_member_code_uidx on public.members (member_code);
create unique index members_national_id_normalized_uidx
  on public.members ((regexp_replace(lower(national_id), '[^a-z0-9]', '', 'g')))
  where national_id is not null and btrim(national_id) <> '';
create index members_status_created_idx on public.members (status, created_at desc);
create index members_join_date_idx on public.members (join_date desc);
create index members_search_trgm_idx on public.members using gin (
  (lower(coalesce(full_name, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(email, '') || ' ' || coalesce(member_code, ''))) extensions.gin_trgm_ops
);

create table public.member_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  plan_id uuid not null references public.membership_plans(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0 and discount <= amount),
  final_amount numeric(12,2) generated always as (amount - discount) stored,
  status text not null default 'active' check (status in ('active', 'cancelled', 'pending')),
  is_current boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_subscriptions_dates_ck check (end_date >= start_date),
  constraint member_subscriptions_cancel_state_ck check (
    (status = 'cancelled' and cancelled_at is not null and not is_current)
    or (status <> 'cancelled' and cancelled_at is null)
  ),
  constraint member_subscriptions_id_member_uk unique (id, member_id)
);

create unique index member_subscriptions_one_current_uidx
  on public.member_subscriptions (member_id)
  where is_current and status <> 'cancelled';
create index member_subscriptions_member_dates_idx on public.member_subscriptions (member_id, start_date desc, end_date desc);
create index member_subscriptions_end_date_idx on public.member_subscriptions (end_date, member_id) where status <> 'cancelled';
create index member_subscriptions_plan_idx on public.member_subscriptions (plan_id, is_current) where status <> 'cancelled';

alter table public.member_subscriptions
  add constraint member_subscriptions_no_overlapping_terms
  exclude using gist (
    member_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status <> 'cancelled');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null default public.next_payment_number() check (char_length(payment_number) between 6 and 40),
  member_id uuid not null references public.members(id) on delete restrict,
  subscription_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  payment_date timestamptz not null default now(),
  payment_type text not null default 'membership' check (payment_type in ('membership', 'renewal', 'registration', 'other')),
  reference_number text check (reference_number is null or char_length(reference_number) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  received_by uuid default auth.uid() references public.profiles(id) on delete set null,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_subscription_member_fk
    foreign key (subscription_id, member_id)
    references public.member_subscriptions(id, member_id) on delete restrict,
  constraint payments_void_state_ck check (
    (not is_voided and voided_at is null and voided_by is null and void_reason is null)
    or (is_voided and voided_at is not null and voided_by is not null)
  )
);

create unique index payments_payment_number_uidx on public.payments (payment_number);
create index payments_date_idx on public.payments (payment_date desc) where not is_voided;
create index payments_member_date_idx on public.payments (member_id, payment_date desc) where not is_voided;
create index payments_subscription_date_idx on public.payments (subscription_id, payment_date, created_at) where not is_voided;
create index payments_method_date_idx on public.payments (payment_method_id, payment_date desc) where not is_voided;

create table public.membership_renewals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  previous_subscription_id uuid not null references public.member_subscriptions(id) on delete restrict,
  new_subscription_id uuid not null unique references public.member_subscriptions(id) on delete restrict,
  renewal_date date not null,
  payment_id uuid references public.payments(id) on delete restrict,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint membership_renewals_different_terms_ck check (previous_subscription_id <> new_subscription_id)
);

create index membership_renewals_member_date_idx on public.membership_renewals (member_id, renewal_date desc, created_at desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_number text not null default public.next_expense_number() check (char_length(expense_number) between 6 and 40),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  description text check (description is null or char_length(description) <= 2000),
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null,
  payment_method_id uuid not null references public.payment_methods(id) on delete restrict,
  reference_number text check (reference_number is null or char_length(reference_number) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_delete_state_ck check (
    (is_deleted and deleted_at is not null)
    or (not is_deleted and deleted_at is null)
  )
);

create unique index expenses_expense_number_uidx on public.expenses (expense_number);
create index expenses_date_idx on public.expenses (expense_date desc) where not is_deleted;
create index expenses_category_date_idx on public.expenses (category_id, expense_date desc) where not is_deleted;
create index expenses_method_date_idx on public.expenses (payment_method_id, expense_date desc) where not is_deleted;

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  phone text not null check (char_length(btrim(phone)) between 5 and 30),
  email text check (email is null or (char_length(email) <= 254 and position('@' in email) > 1)),
  position text not null check (char_length(btrim(position)) between 2 and 80),
  salary numeric(12,2) check (salary is null or salary >= 0),
  hire_date date not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  address text check (address is null or char_length(address) <= 1000),
  notes text check (notes is null or char_length(notes) <= 2000),
  photo_path text check (photo_path is null or char_length(photo_path) <= 500),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_email_lower_uidx on public.staff (lower(email)) where email is not null;
create index staff_status_position_idx on public.staff (status, position, full_name);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  category text check (category is null or char_length(category) <= 80),
  brand text check (brand is null or char_length(brand) <= 80),
  model text check (model is null or char_length(model) <= 80),
  serial_number text check (serial_number is null or char_length(serial_number) <= 120),
  purchase_date date,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  condition text not null default 'good' check (condition in ('excellent', 'good', 'fair', 'poor')),
  status text not null default 'active' check (status in ('active', 'maintenance', 'damaged', 'retired')),
  last_maintenance_date date,
  next_maintenance_date date,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipment_maintenance_dates_ck check (
    next_maintenance_date is null
    or last_maintenance_date is null
    or next_maintenance_date >= last_maintenance_date
  )
);

create unique index equipment_serial_number_lower_uidx on public.equipment (lower(serial_number)) where serial_number is not null;
create index equipment_status_idx on public.equipment (status, name);
create index equipment_category_idx on public.equipment (category, name);
create index equipment_next_maintenance_idx on public.equipment (next_maintenance_date) where status <> 'retired';

create table public.complaints_feedback (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  name text check (name is null or char_length(name) <= 120),
  phone text check (phone is null or char_length(phone) <= 30),
  type text not null check (type in ('complaint', 'suggestion', 'feedback')),
  subject text not null check (char_length(btrim(subject)) between 2 and 180),
  message text not null check (char_length(btrim(message)) between 2 and 5000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  admin_response text check (admin_response is null or char_length(admin_response) <= 5000),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_resolution_state_ck check (
    (status in ('resolved', 'closed') and resolved_at is not null and admin_response is not null)
    or (status in ('new', 'reviewing') and resolved_at is null)
  )
);

create index complaints_status_created_idx on public.complaints_feedback (status, created_at desc);
create index complaints_priority_status_idx on public.complaints_feedback (priority, status, created_at desc);
create index complaints_member_idx on public.complaints_feedback (member_id, created_at desc) where member_id is not null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 2 and 80),
  title text not null check (char_length(btrim(title)) between 2 and 180),
  message text not null check (char_length(btrim(message)) between 2 and 1000),
  action_url text check (action_url is null or (char_length(action_url) <= 500 and left(action_url, 1) = '/')),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_read_state_ck check (
    (is_read and read_at is not null)
    or (not is_read and read_at is null)
  )
);

create index notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);

create table public.reminder_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  reminder_days integer[] not null default array[7, 3, 0]::integer[] check (cardinality(reminder_days) > 0),
  channels text[] not null default array['email']::text[] check (
    cardinality(channels) > 0
    and channels <@ array['email', 'sms', 'whatsapp']::text[]
  ),
  english_template text not null check (char_length(english_template) between 2 and 2000),
  urdu_template text not null check (char_length(urdu_template) between 2 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminder_logs (
  id uuid primary key default gen_random_uuid(),
  reminder_setting_id uuid not null references public.reminder_settings(id) on delete restrict,
  member_id uuid references public.members(id) on delete set null,
  subscription_id uuid references public.member_subscriptions(id) on delete set null,
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  recipient text not null check (char_length(recipient) between 3 and 254),
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'mocked', 'skipped')),
  due_date date not null,
  sent_at timestamptz,
  provider_response text check (provider_response is null or char_length(provider_response) <= 1000),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminder_logs_due_status_idx on public.reminder_logs (due_date, status, created_at);
create index reminder_logs_member_idx on public.reminder_logs (member_id, created_at desc) where member_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb)
    - array['national_id', 'phone', 'email', 'address', 'notes', 'message', 'admin_response', 'english_template', 'urdu_template'];
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb)
    - array['national_id', 'phone', 'email', 'address', 'notes', 'message', 'admin_response', 'english_template', 'urdu_template'];
  v_entity_id text;
begin
  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    lower(tg_table_name || '_' || tg_op),
    tg_table_name,
    v_entity_id,
    jsonb_build_object('old', v_old, 'new', v_new)
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'membership_plans', 'payment_methods', 'expense_categories', 'gym_settings',
    'members', 'member_subscriptions', 'payments', 'expenses', 'staff', 'equipment',
    'complaints_feedback', 'notifications', 'reminder_settings', 'reminder_logs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      v_table || '_set_updated_at',
      v_table
    );
  end loop;

  foreach v_table in array array[
    'profiles', 'membership_plans', 'payment_methods', 'expense_categories', 'gym_settings',
    'members', 'member_subscriptions', 'payments', 'membership_renewals', 'expenses', 'staff',
    'equipment', 'complaints_feedback', 'reminder_settings'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      v_table || '_audit_row_change',
      v_table
    );
  end loop;
end
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  if new.email is null then
    raise exception 'FITX accounts require an email address' using errcode = '23514';
  end if;

  v_full_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, email, role, is_active)
  values (new.id, left(v_full_name, 120), lower(new.email), 'receptionist', false);

  return new;
end;
$$;

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    raise exception 'FITX accounts require an email address' using errcode = '23514';
  end if;

  update public.profiles
  set email = lower(new.email)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_auth_user_email();

revoke all on function public.audit_row_change() from public;
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.sync_auth_user_email() from public;
revoke all on function public.set_updated_at() from public;

