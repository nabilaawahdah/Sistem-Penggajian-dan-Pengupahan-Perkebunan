-- Arboria: skema inti akuntansi penggajian dan pengupahan perkebunan.
-- Jalankan seluruh file ini di Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  employment_type text not null check (employment_type in ('staff', 'harvester')),
  division text not null,
  monthly_salary numeric(14, 2) not null default 0 check (monthly_salary >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id text not null constraint attendance_records_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  working_days smallint not null default 0 check (working_days >= 0),
  leave_days smallint not null default 0 check (leave_days >= 0),
  absent_days smallint not null default 0 check (absent_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_employee_period_key unique (employee_id, period_id),
  constraint attendance_records_month_days_check check (
    working_days + leave_days + absent_days <=
      extract(day from (date_trunc('month', to_date(period_id || '-01', 'YYYY-MM-DD')) + interval '1 month - 1 day'))
  )
);

do $$
begin
  if to_regclass('public.periods') is null then
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'pay_periods' and c.relkind in ('r', 'p')
    ) then
      execute 'alter table public.pay_periods rename to periods';
    elsif exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'payroll_periods' and c.relkind in ('r', 'p')
    ) then
      execute 'alter table public.payroll_periods rename to periods';
    end if;
  end if;
end
$$;

create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id text not null constraint salary_payments_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  payment_date date not null,
  basic_salary numeric(14, 2) not null check (basic_salary >= 0),
  allowances numeric(14, 2) not null default 0 check (allowances >= 0),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0),
  total_amount numeric(14, 2) generated always as (basic_salary + allowances - deductions) stored,
  status text not null default 'paid' check (status in ('paid', 'pending')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (basic_salary + allowances >= deductions)
);

alter table public.salary_payments
  add column if not exists payment_date date;

update public.salary_payments
set payment_date = (to_date(period_id || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
where payment_date is null;

alter table public.salary_payments
  alter column payment_date set not null;

create table if not exists public.harvest_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id text not null constraint harvest_records_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  harvest_date date not null default current_date,
  weight_kg numeric(12, 2) not null check (weight_kg > 0),
  rate_per_kg numeric(14, 2) not null check (rate_per_kg >= 0),
  total_amount numeric(14, 2) generated always as (weight_kg * rate_per_kg) stored,
  status text not null default 'paid' check (status in ('paid', 'pending')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.salary_payments drop column if exists full_name;
alter table public.salary_payments drop column if exists employee_name;
alter table public.harvest_records drop column if exists full_name;
alter table public.harvest_records drop column if exists employee_name;

alter table public.harvest_records
  add column if not exists paid_at timestamptz;

drop trigger if exists sync_payroll_period on public.salary_payments;
drop trigger if exists sync_payroll_period on public.harvest_records;

do $$
declare
  salary_period_type text;
  harvest_period_type text;
begin
  select data_type into salary_period_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'salary_payments' and column_name = 'period_id';
  if salary_period_type = 'uuid' then
    if to_regclass('public.periods') is null then
      raise exception 'Master periode lama tidak ditemukan; UUID period_id tidak dapat dikonversi ke YYYY-MM.';
    end if;
    alter table public.salary_payments add column if not exists period_code text;
    update public.salary_payments s set period_code = p.period from public.periods p where p.id = s.period_id;
    alter table public.salary_payments drop constraint if exists salary_payments_period_id_fkey;
    alter table public.salary_payments drop column period_id;
    alter table public.salary_payments rename column period_code to period_id;
  end if;

  select data_type into harvest_period_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'harvest_records' and column_name = 'period_id';
  if harvest_period_type = 'uuid' then
    if to_regclass('public.periods') is null then
      raise exception 'Master periode lama tidak ditemukan; UUID period_id tidak dapat dikonversi ke YYYY-MM.';
    end if;
    alter table public.harvest_records add column if not exists period_code text;
    update public.harvest_records h set period_code = p.period from public.periods p where p.id = h.period_id;
    alter table public.harvest_records drop constraint if exists harvest_records_period_id_fkey;
    alter table public.harvest_records drop column period_id;
    alter table public.harvest_records rename column period_code to period_id;
  end if;
end
$$;

alter table public.salary_payments drop constraint if exists salary_payments_period_id_format_check;
alter table public.salary_payments alter column period_id set not null;
alter table public.salary_payments add constraint salary_payments_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$');

alter table public.harvest_records drop constraint if exists harvest_records_period_id_format_check;
alter table public.harvest_records alter column period_id set not null;
alter table public.harvest_records add constraint harvest_records_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$');

create index if not exists salary_payments_employee_period_idx
  on public.salary_payments (employee_id, period_id);
create index if not exists attendance_records_period_employee_idx
  on public.attendance_records (period_id, employee_id);
create index if not exists harvest_records_employee_period_idx
  on public.harvest_records (employee_id, period_id);

drop index if exists public.pay_periods_period_idx;
drop index if exists public.payroll_periods_period_idx;

drop view if exists public.payroll_periods;
drop table if exists public.payroll_period;
drop table if exists public.payroll_records;

drop trigger if exists sync_payroll_period on public.salary_payments;
drop trigger if exists sync_payroll_period on public.harvest_records;

alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.salary_payments enable row level security;
alter table public.harvest_records enable row level security;

-- Mode demo publik: siapa pun dengan URL dan publishable key dapat membaca,
-- menambah, mengubah, dan menghapus data. Gunakan hanya data latihan.
grant usage on schema public to anon;
grant select, insert, update, delete on public.employees to anon;
grant select, insert, update, delete on public.attendance_records to anon;
grant select, insert, update, delete on public.salary_payments to anon;
grant select, insert, update, delete on public.harvest_records to anon;

drop policy if exists "Public demo access" on public.employees;
create policy "Public demo access" on public.employees
  for all to anon using (true) with check (true);

drop policy if exists "Public demo access" on public.attendance_records;
create policy "Public demo access" on public.attendance_records
  for all to anon using (true) with check (true);

drop policy if exists "Public demo access" on public.salary_payments;
create policy "Public demo access" on public.salary_payments
  for all to anon using (true) with check (true);

drop policy if exists "Public demo access" on public.harvest_records;
create policy "Public demo access" on public.harvest_records
  for all to anon using (true) with check (true);

drop table if exists public.periods;
