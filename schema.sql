-- Arboria: skema inti akuntansi penggajian dan pengupahan perkebunan.
-- Jalankan sekali di Supabase SQL Editor; migrasi konsolidasi ada di bagian akhir.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('payroll_records', 'payroll_journals')
      and column_name = 'record_type'
  ) then
    raise exception 'Payroll sudah dikonsolidasikan. Jangan jalankan ulang schema.sql.';
  end if;
end
$$;

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  employment_type text not null check (employment_type in ('staff', 'harvester')),
  division text not null,
  monthly_salary numeric(14, 2) not null default 0 check (monthly_salary >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.employees add column if not exists archived_at timestamptz;

create or replace function public.prevent_employee_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Data karyawan tidak dihapus permanen. Gunakan fitur Hapus agar riwayat tetap tersimpan.';
  return old;
end;
$$;
drop trigger if exists employees_hard_delete_guard on public.employees;
create trigger employees_hard_delete_guard
  before delete on public.employees
  for each row execute function public.prevent_employee_hard_delete();

create table if not exists public.harvest_blocks (
  code text primary key,
  commodity text,
  unit text,
  standard_rate numeric(14, 2) check (standard_rate is null or standard_rate >= 0),
  created_at timestamptz not null default now()
);
insert into public.harvest_blocks (code) values ('Blok A'), ('Blok B'), ('Blok C'), ('Blok D')
on conflict (code) do nothing;

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
  block_code text references public.harvest_blocks(code) on update cascade on delete restrict,
  commodity text,
  unit text,
  period_id text not null constraint harvest_records_period_id_format_check check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  harvest_date date not null default current_date,
  weight_kg numeric(12, 2) not null check (weight_kg > 0),
  rate_per_kg numeric(14, 2) not null check (rate_per_kg >= 0),
  deductions numeric(14, 2) not null default 0 check (deductions >= 0),
  total_amount numeric(14, 2) generated always as (weight_kg * rate_per_kg - deductions) stored,
  status text not null default 'paid' check (status in ('paid', 'pending')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.harvest_records add column if not exists block_code text references public.harvest_blocks(code) on update cascade on delete restrict;
alter table public.harvest_records add column if not exists commodity text;
alter table public.harvest_records add column if not exists unit text;

alter table public.salary_payments drop column if exists full_name;
alter table public.salary_payments drop column if exists employee_name;
alter table public.harvest_records drop column if exists full_name;
alter table public.harvest_records drop column if exists employee_name;

alter table public.harvest_records
  add column if not exists paid_at timestamptz;
alter table public.harvest_records
  add column if not exists deductions numeric(14, 2) not null default 0 check (deductions >= 0);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'harvest_records'
      and column_name = 'total_amount' and position('deductions' in generation_expression) = 0
  ) then
    alter table public.harvest_records drop column total_amount;
    alter table public.harvest_records
      add column total_amount numeric(14, 2) generated always as (weight_kg * rate_per_kg - deductions) stored;
  end if;
end
$$;
alter table public.harvest_records drop constraint if exists harvest_records_deduction_limit_check;
alter table public.harvest_records add constraint harvest_records_deduction_limit_check
  check (weight_kg * rate_per_kg >= deductions);
alter table public.salary_payments add column if not exists slip_number text;
alter table public.harvest_records add column if not exists slip_number text;

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
grant select, insert, update on public.employees to anon;
revoke delete on public.employees from anon, authenticated;
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

-- Chart of accounts and immutable payroll journal.
create table if not exists public.accounts (
  code text primary key,
  name text not null unique,
  account_type text not null,
  normal_balance text not null check (normal_balance in ('debit', 'credit'))
);

create table if not exists public.arboria_schema_migrations (
  migration_key text primary key,
  status text not null check (status in ('pending', 'done')),
  updated_at timestamptz not null default now()
);

insert into public.arboria_schema_migrations (migration_key, status)
select 'salary-allowance-account-split-v1', 'pending'
where exists (
  select 1 from public.accounts where code = '5-103' and name = 'Potongan Gaji'
)
on conflict (migration_key) do nothing;

update public.accounts
set name = '__arboria_legacy_potongan_gaji'
where code = '5-103' and name = 'Potongan Gaji';
update public.accounts
set name = '__arboria_legacy_beban_tunjangan'
where code = '5-104' and name = 'Beban Tunjangan';

insert into public.accounts (code, name, account_type, normal_balance) values
  ('1-101', 'Kas/Bank', 'Aset', 'debit'),
  ('2-101', 'Utang Gaji', 'Kewajiban', 'credit'),
  ('2-102', 'Utang Upah', 'Kewajiban', 'credit'),
  ('5-101', 'Beban Gaji Staf', 'Beban', 'debit'),
  ('5-102', 'Beban Upah Panen', 'Beban', 'debit'),
  ('5-103', 'Beban Tunjangan', 'Beban', 'debit'),
  ('5-104', 'Potongan Gaji', 'Kontra Beban', 'credit')
on conflict (code) do update set
  name = excluded.name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance;

create table if not exists public.payroll_journals (
  id uuid primary key default gen_random_uuid(),
  journal_number text unique,
  journal_date date not null,
  description text not null,
  journal_type text not null check (journal_type in ('salary', 'harvest', 'payment', 'reversal')),
  transaction_kind text check (transaction_kind in ('salary', 'harvest')),
  transaction_id uuid,
  reversal_of uuid references public.payroll_journals(id),
  cancellation_reason text,
  created_by text not null default 'Admin Arboria',
  created_at timestamptz not null default now()
);
alter table public.payroll_journals alter column journal_number drop not null;

create table if not exists public.payroll_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.payroll_journals(id) on delete restrict,
  account_code text not null references public.accounts(code) on delete restrict,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  line_order integer not null default 0,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
alter table public.payroll_journal_lines
  add column if not exists line_order integer not null default 0;

create table if not exists public.payroll_corrections (
  id uuid primary key default gen_random_uuid(),
  transaction_kind text not null check (transaction_kind in ('salary', 'harvest')),
  original_transaction_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id text not null check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  correction_date date not null default current_date,
  slip_number text not null unique,
  correction_values jsonb not null,
  delta_basic_salary numeric(14, 2) not null default 0,
  delta_allowances numeric(14, 2) not null default 0,
  delta_deductions numeric(14, 2) not null default 0,
  delta_gross numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null,
  reason text not null,
  status text not null check (status in ('pending', 'paid', 'overpaid', 'cancelled')),
  paid_at timestamptz,
  paid_with_original boolean not null default false,
  created_by text not null default 'Admin Arboria',
  created_at timestamptz not null default now()
);

do $$
declare
  migration_pending boolean;
begin
  select exists (
    select 1 from public.arboria_schema_migrations
    where migration_key = 'salary-allowance-account-split-v1' and status = 'pending'
  ) into migration_pending;
  if not migration_pending then return; end if;

  update public.payroll_journal_lines line
  set account_code = case line.account_code
    when '5-103' then '5-104'
    when '5-104' then '5-103'
  end
  from public.payroll_journals journal
  where journal.id = line.journal_id
    and journal.transaction_kind = 'salary'
    and line.account_code in ('5-103', '5-104');

  delete from public.payroll_journal_lines line
  using public.payroll_journals journal, public.salary_payments salary
  where journal.id = line.journal_id
    and journal.journal_type = 'salary'
    and journal.transaction_kind = 'salary'
    and journal.transaction_id = salary.id
    and line.account_code = '5-101'
    and line.debit > 0
    and salary.basic_salary = 0;

  update public.payroll_journal_lines line
  set debit = salary.basic_salary
  from public.payroll_journals journal, public.salary_payments salary
  where journal.id = line.journal_id
    and journal.journal_type = 'salary'
    and journal.transaction_kind = 'salary'
    and journal.transaction_id = salary.id
    and line.account_code = '5-101'
    and line.debit > 0
    and salary.basic_salary > 0;

  insert into public.payroll_journal_lines (journal_id, account_code, debit, credit)
  select journal.id, '5-103', salary.allowances, 0
  from public.payroll_journals journal
  join public.salary_payments salary on salary.id = journal.transaction_id
  where journal.journal_type = 'salary'
    and journal.transaction_kind = 'salary'
    and salary.allowances > 0;

  delete from public.payroll_journal_lines line
  using public.payroll_journals reversal
  where reversal.id = line.journal_id
    and reversal.journal_type = 'reversal'
    and reversal.transaction_kind = 'salary';

  insert into public.payroll_journal_lines (journal_id, account_code, debit, credit)
  select reversal.id, source_line.account_code, source_line.credit, source_line.debit
  from public.payroll_journals reversal
  join public.payroll_journals source
    on source.transaction_kind = 'salary'
   and source.journal_type <> 'reversal'
   and (
     source.transaction_id = reversal.transaction_id
     or exists (
       select 1 from public.payroll_corrections correction
       where correction.transaction_kind = 'salary'
         and correction.original_transaction_id = reversal.transaction_id
         and correction.id = source.transaction_id
     )
   )
  join public.payroll_journal_lines source_line on source_line.journal_id = source.id
  where reversal.journal_type = 'reversal'
    and reversal.transaction_kind = 'salary'
    and (source_line.debit > 0 or source_line.credit > 0);

  update public.arboria_schema_migrations
  set status = 'done', updated_at = now()
  where migration_key = 'salary-allowance-account-split-v1';
end
$$;

-- Nomor bukti transaksi dipakai sebagai identitas tampilan jurnal.
alter table public.payroll_journals drop constraint if exists payroll_journals_journal_number_key;
drop index if exists public.payroll_journals_journal_number_key;
update public.payroll_journals journal
set journal_number = salary.slip_number
from public.salary_payments salary
where salary.id = journal.transaction_id
  and salary.slip_number is not null;

update public.payroll_journals journal
set journal_number = harvest.slip_number
from public.harvest_records harvest
where harvest.id = journal.transaction_id
  and harvest.slip_number is not null;

update public.payroll_journals journal
set description = 'Pembalik '
  || coalesce(nullif(salary.slip_number, ''), employee.full_name || ' - ' || salary.period_id, 'Tanpa nomor slip')
  || ': ' || coalesce(nullif(journal.cancellation_reason, ''), 'Pembatalan transaksi')
from public.salary_payments salary
join public.employees employee on employee.id = salary.employee_id
where journal.journal_type = 'reversal'
  and salary.id = journal.transaction_id;

update public.payroll_journals journal
set description = 'Pembalik '
  || coalesce(nullif(harvest.slip_number, ''), employee.full_name || ' - ' || harvest.period_id, 'Tanpa nomor slip')
  || ': ' || coalesce(nullif(journal.cancellation_reason, ''), 'Pembatalan transaksi')
from public.harvest_records harvest
join public.employees employee on employee.id = harvest.employee_id
where journal.journal_type = 'reversal'
  and harvest.id = journal.transaction_id;

create index if not exists payroll_journals_date_idx on public.payroll_journals (journal_date, journal_number);
create index if not exists payroll_journals_transaction_idx on public.payroll_journals (transaction_id);
create index if not exists payroll_journal_lines_account_idx on public.payroll_journal_lines (account_code, journal_id);

create table if not exists public.payroll_audit_trail (
  id uuid primary key default gen_random_uuid(),
  transaction_kind text not null check (transaction_kind in ('salary', 'harvest')),
  transaction_id uuid not null,
  action text not null check (action in ('dicatat', 'dibayar', 'dibatalkan')),
  actor text not null default 'Admin Arboria',
  reason text,
  occurred_at timestamptz not null default now()
);

alter table public.salary_payments add column if not exists cancellation_reason text;
alter table public.salary_payments add column if not exists cancelled_by text;
alter table public.harvest_records add column if not exists cancellation_reason text;
alter table public.harvest_records add column if not exists cancelled_by text;
alter table public.salary_payments drop constraint if exists salary_payments_status_check;
alter table public.salary_payments add constraint salary_payments_status_check check (status in ('paid', 'pending', 'cancelled'));
alter table public.harvest_records drop constraint if exists harvest_records_status_check;
alter table public.harvest_records add constraint harvest_records_status_check check (status in ('paid', 'pending', 'cancelled'));

create or replace function public.next_payroll_journal_number(journal_day date)
returns text
language plpgsql
as $$
declare
  journal_year text := to_char(journal_day, 'YYYY');
  next_number integer;
begin
  perform pg_advisory_xact_lock(hashtext('arboria-journal-' || journal_year));
  select coalesce(max(substring(journal_number from 9)::integer), 0) + 1
    into next_number
    from public.payroll_journals
    where journal_number like 'JU-' || journal_year || '-%';
  return 'JU-' || journal_year || '-' || lpad(next_number::text, 4, '0');
end;
$$;

create or replace function public.next_payroll_slip_number(
  transaction_type text,
  transaction_day date
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  slip_prefix text;
  slip_year text := to_char(transaction_day, 'YYYY');
  next_number integer;
begin
  if transaction_type not in ('salary', 'harvest') then
    raise exception 'Jenis transaksi tidak valid untuk nomor slip.';
  end if;
  slip_prefix := case when transaction_type = 'salary' then 'GS' else 'UP' end;
  perform pg_advisory_xact_lock(hashtext('arboria-slip-' || slip_prefix || '-' || slip_year));
  if transaction_type = 'salary' then
    select greatest(
      coalesce((select max(substring(slip_number from 9)::integer) from public.salary_payments
        where slip_number ~ ('^GS-' || slip_year || '-[0-9]+$')), 0),
      coalesce((select max(substring(slip_number from 9)::integer) from public.payroll_corrections
        where transaction_kind = 'salary' and slip_number ~ ('^GS-' || slip_year || '-[0-9]+$')), 0)
    ) + 1
      into next_number;
  else
    select greatest(
      coalesce((select max(substring(slip_number from 9)::integer) from public.harvest_records
        where slip_number ~ ('^UP-' || slip_year || '-[0-9]+$')), 0),
      coalesce((select max(substring(slip_number from 9)::integer) from public.payroll_corrections
        where transaction_kind = 'harvest' and slip_number ~ ('^UP-' || slip_year || '-[0-9]+$')), 0)
    ) + 1
      into next_number;
  end if;
  return slip_prefix || '-' || slip_year || '-'
    || lpad(next_number::text, greatest(4, length(next_number::text)), '0');
end;
$$;

drop function if exists public.create_payroll_journal(date, text, text, text, uuid, jsonb, uuid, text);
create or replace function public.create_payroll_journal(
  journal_day date,
  journal_description text,
  journal_kind text,
  transaction_type text,
  transaction_key uuid,
  lines jsonb,
  reversal_key uuid default null,
  reason text default null,
  evidence_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_journal_id uuid;
  journal_number_value text := evidence_number;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
begin
  select coalesce(sum((line->>'debit')::numeric), 0),
         coalesce(sum((line->>'credit')::numeric), 0)
    into debit_total, credit_total
    from jsonb_array_elements(lines) as entries(line);
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Jurnal tidak seimbang: total debit % dan kredit %.', debit_total, credit_total;
  end if;
  if journal_number_value is null then
    if transaction_type = 'salary' then
      select slip_number into journal_number_value
      from public.salary_payments where id = transaction_key;
    elsif transaction_type = 'harvest' then
      select slip_number into journal_number_value
      from public.harvest_records where id = transaction_key;
    end if;
  end if;
  if journal_kind = 'payment' and nullif(journal_number_value, '') is null then
    raise exception 'Nomor slip wajib tersedia untuk jurnal pembayaran.';
  end if;
  insert into public.payroll_journals
    (journal_number, journal_date, description, journal_type, transaction_kind, transaction_id, reversal_of, cancellation_reason)
  values
    (journal_number_value, journal_day, journal_description, journal_kind, transaction_type, transaction_key, reversal_key, reason)
  returning id into new_journal_id;

  insert into public.payroll_journal_lines (journal_id, account_code, debit, credit, line_order)
  select new_journal_id, line->>'account_code',
         coalesce((line->>'debit')::numeric, 0), coalesce((line->>'credit')::numeric, 0),
         ordinality::integer
    from jsonb_array_elements(lines) with ordinality as entries(line, ordinality)
    where coalesce((line->>'debit')::numeric, 0) > 0 or coalesce((line->>'credit')::numeric, 0) > 0;
  return new_journal_id;
end;
$$;

create or replace function public.write_payroll_expense_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_name text;
  is_salary boolean := tg_table_name = 'salary_payments';
  gross_amount numeric(14, 2);
  net_amount numeric(14, 2);
  expense_account text;
  liability_account text;
  journal_kind text;
  journal_day date;
  journal_description text;
  journal_lines jsonb;
begin
  select full_name into employee_name from public.employees where id = new.employee_id;
  expense_account := case when is_salary then '5-101' else '5-102' end;
  liability_account := case when is_salary then '2-101' else '2-102' end;
  journal_kind := case when is_salary then 'salary' else 'harvest' end;
  net_amount := new.total_amount;
  if is_salary then
    gross_amount := new.basic_salary + new.allowances;
    journal_day := new.payment_date;
  else
    gross_amount := new.weight_kg * new.rate_per_kg;
    journal_day := new.harvest_date;
  end if;
  journal_description := case when is_salary then 'Gaji ' else 'Upah panen ' end
    || employee_name || ' - ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(new.period_id, 6, 2)::integer]
    || ' ' || substring(new.period_id, 1, 4);
  if is_salary then
    journal_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5-101', 'debit', new.basic_salary, 'credit', 0),
      jsonb_build_object('account_code', '5-103', 'debit', new.allowances, 'credit', 0),
      jsonb_build_object('account_code', '5-104', 'debit', 0, 'credit', new.deductions),
      jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', net_amount)
    );
  else
    journal_lines := jsonb_build_array(
      jsonb_build_object('account_code', expense_account, 'debit', gross_amount, 'credit', 0),
      jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', net_amount)
    );
    if new.deductions > 0 then
      journal_lines := jsonb_insert(journal_lines, '{1}',
        jsonb_build_object('account_code', '5-103', 'debit', 0, 'credit', new.deductions));
    end if;
  end if;
  perform public.create_payroll_journal(journal_day, journal_description, journal_kind,
    journal_kind, new.id, journal_lines);
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action)
    values (journal_kind, new.id, 'dicatat');

  if new.status = 'paid' then
    if new.total_amount > 0 then
      perform public.create_payroll_journal(coalesce(new.paid_at::date, journal_day),
        'Pembayaran ' || journal_description, 'payment', journal_kind, new.id,
        jsonb_build_array(
          jsonb_build_object('account_code', liability_account, 'debit', net_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', net_amount)
        ));
    end if;
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action)
      values (journal_kind, new.id, 'dibayar');
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_amount numeric(14, 2);
  correction_amount numeric(14, 2) := 0;
begin
  if tg_op = 'DELETE' then
    raise exception 'Transaksi penggajian terkunci dan tidak dapat dihapus. Gunakan koreksi atau Batal.';
  end if;
  if current_setting('arboria.backfill_slip', true) = 'true' then
    if new.slip_number is null then
      if old.slip_number is null
         or not (old.status = 'pending' or (old.status = 'cancelled' and old.paid_at is null)) then
        raise exception 'Nomor slip transaksi yang sudah dibayar tidak dapat dihapus.';
      end if;
    elsif old.slip_number is not null then
      raise exception 'Nomor slip hanya dapat diisi satu kali saat migrasi.';
    end if;
    if tg_table_name = 'salary_payments' then
      if new.id is distinct from old.id
         or new.employee_id is distinct from old.employee_id
         or new.period_id is distinct from old.period_id
         or new.payment_date is distinct from old.payment_date
         or new.basic_salary is distinct from old.basic_salary
         or new.allowances is distinct from old.allowances
         or new.deductions is distinct from old.deductions
         or new.status is distinct from old.status
         or new.paid_at is distinct from old.paid_at
         or new.cancellation_reason is distinct from old.cancellation_reason
         or new.cancelled_by is distinct from old.cancelled_by
         or new.created_at is distinct from old.created_at then
        raise exception 'Migrasi nomor slip tidak boleh mengubah transaksi.';
      end if;
    else
      if new.id is distinct from old.id
         or new.employee_id is distinct from old.employee_id
         or new.period_id is distinct from old.period_id
         or new.harvest_date is distinct from old.harvest_date
         or new.weight_kg is distinct from old.weight_kg
         or new.rate_per_kg is distinct from old.rate_per_kg
         or new.deductions is distinct from old.deductions
         or new.status is distinct from old.status
         or new.paid_at is distinct from old.paid_at
         or new.cancellation_reason is distinct from old.cancellation_reason
         or new.cancelled_by is distinct from old.cancelled_by
         or new.created_at is distinct from old.created_at then
        raise exception 'Migrasi nomor slip tidak boleh mengubah transaksi.';
      end if;
    end if;
    return new;
  end if;
  if current_setting('arboria.allow_cancel', true) = 'true' then
    if new.status <> 'cancelled' or old.status = 'cancelled'
       or nullif(trim(new.cancellation_reason), '') is null
       or new.cancelled_by is null then
      raise exception 'Perubahan transaksi tidak diizinkan.';
    end if;
    if tg_table_name = 'salary_payments' then
      if new.id is distinct from old.id
         or new.employee_id is distinct from old.employee_id
         or new.period_id is distinct from old.period_id
         or new.payment_date is distinct from old.payment_date
         or new.basic_salary is distinct from old.basic_salary
         or new.allowances is distinct from old.allowances
         or new.deductions is distinct from old.deductions
         or new.slip_number is distinct from old.slip_number
         or new.paid_at is distinct from old.paid_at
         or new.created_at is distinct from old.created_at then
        raise exception 'Perubahan transaksi tidak diizinkan.';
      end if;
    else
      if new.id is distinct from old.id
         or new.employee_id is distinct from old.employee_id
         or new.period_id is distinct from old.period_id
         or new.harvest_date is distinct from old.harvest_date
         or new.weight_kg is distinct from old.weight_kg
         or new.rate_per_kg is distinct from old.rate_per_kg
         or new.deductions is distinct from old.deductions
         or new.slip_number is distinct from old.slip_number
         or new.paid_at is distinct from old.paid_at
         or new.created_at is distinct from old.created_at then
        raise exception 'Perubahan transaksi tidak diizinkan.';
      end if;
    end if;
    return new;
  end if;
  if old.status <> 'pending' or new.status <> 'paid' then
    raise exception 'Transaksi terkunci. Hanya pembayaran atau pembatalan melalui proses resmi yang diizinkan.';
  end if;
  new.paid_at := coalesce(old.paid_at, now());
  if tg_table_name = 'salary_payments' then
    transaction_amount := new.basic_salary + new.allowances - new.deductions;
  else
    transaction_amount := new.weight_kg * new.rate_per_kg - new.deductions;
  end if;
  select coalesce(sum(correction.net_amount), 0)
    into correction_amount
    from public.payroll_corrections correction
    where correction.transaction_kind = case when tg_table_name = 'salary_payments' then 'salary' else 'harvest' end
      and correction.original_transaction_id = new.id
      and correction.status = 'pending';
  transaction_amount := transaction_amount + correction_amount;
  if transaction_amount < 0 then
    raise exception 'Nilai akhir setelah koreksi tidak boleh kurang dari nol.';
  end if;
  if old.slip_number is null and transaction_amount > 0 then
    new.slip_number := public.next_payroll_slip_number(
      case when tg_table_name = 'salary_payments' then 'salary' else 'harvest' end,
      new.paid_at::date
    );
  else
    new.slip_number := old.slip_number;
  end if;
  if tg_table_name = 'salary_payments' then
    if new.id is distinct from old.id
       or new.employee_id is distinct from old.employee_id
       or new.period_id is distinct from old.period_id
       or new.payment_date is distinct from old.payment_date
       or new.basic_salary is distinct from old.basic_salary
       or new.allowances is distinct from old.allowances
       or new.deductions is distinct from old.deductions
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.cancelled_by is distinct from old.cancelled_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Transaksi terkunci. Hanya pembayaran atau pembatalan melalui proses resmi yang diizinkan.';
    end if;
  else
    if new.id is distinct from old.id
       or new.employee_id is distinct from old.employee_id
       or new.period_id is distinct from old.period_id
       or new.harvest_date is distinct from old.harvest_date
       or new.weight_kg is distinct from old.weight_kg
       or new.rate_per_kg is distinct from old.rate_per_kg
       or new.deductions is distinct from old.deductions
       or new.cancellation_reason is distinct from old.cancellation_reason
       or new.cancelled_by is distinct from old.cancelled_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Transaksi terkunci. Hanya pembayaran atau pembatalan melalui proses resmi yang diizinkan.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_insert()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.employees
    where id = new.employee_id and archived_at is not null
  ) then
    raise exception 'Karyawan sudah dihapus dan tidak dapat menerima transaksi baru.';
  end if;
  if new.status = 'cancelled' then
    raise exception 'Transaksi baru tidak dapat langsung berstatus dibatalkan.';
  end if;
  if new.slip_number is not null then
    raise exception 'Nomor slip dibuat otomatis oleh database.';
  end if;
  if tg_table_name = 'salary_payments' then
    if new.status = 'paid' and new.basic_salary + new.allowances - new.deductions > 0 then
      new.paid_at := coalesce(new.paid_at, now());
      new.slip_number := public.next_payroll_slip_number('salary', new.paid_at::date);
    elsif new.status = 'pending' then
      new.slip_number := null;
      new.paid_at := null;
    end if;
  else
    if new.deductions <> 0 then
      raise exception 'Upah panen dihitung dari bobot dikali tarif tanpa potongan.';
    end if;
    if new.status = 'paid' and new.weight_kg * new.rate_per_kg - new.deductions > 0 then
      new.paid_at := coalesce(new.paid_at, now());
      new.slip_number := public.next_payroll_slip_number('harvest', new.paid_at::date);
    elsif new.status = 'pending' then
      new.slip_number := null;
      new.paid_at := null;
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  perform set_config('arboria.backfill_slip', 'true', true);
end
$$;
with missing as (
  select id, payment_date, created_at,
    row_number() over (partition by to_char(payment_date, 'YYYY') order by payment_date, created_at, id) as seq_no
  from public.salary_payments
  where slip_number is null
    and (status = 'paid' or (status = 'cancelled' and paid_at is not null))
), existing_max as (
  select year, max(number) as max_number
  from (
    select substring(slip_number from 4 for 4) as year, substring(slip_number from 9)::integer as number
    from public.salary_payments where slip_number ~ '^GS-[0-9]{4}-[0-9]+$'
    union all
    select substring(slip_number from 4 for 4), substring(slip_number from 9)::integer
    from public.payroll_corrections
    where transaction_kind = 'salary' and slip_number ~ '^GS-[0-9]{4}-[0-9]+$'
  ) as existing_numbers
  group by year
), numbered as (
  select missing.id, 'GS-' || to_char(missing.payment_date, 'YYYY') || '-'
    || lpad((coalesce(existing_max.max_number, 0) + missing.seq_no)::text,
      greatest(4, length((coalesce(existing_max.max_number, 0) + missing.seq_no)::text)), '0') as slip_number
  from missing
  left join existing_max on existing_max.year = to_char(missing.payment_date, 'YYYY')
)
update public.salary_payments as payments
set slip_number = numbered.slip_number
from numbered
where payments.id = numbered.id;

with missing as (
  select id, harvest_date, created_at,
    row_number() over (partition by to_char(harvest_date, 'YYYY') order by harvest_date, created_at, id) as seq_no
  from public.harvest_records
  where slip_number is null
    and (status = 'paid' or (status = 'cancelled' and paid_at is not null))
), existing_max as (
  select year, max(number) as max_number
  from (
    select substring(slip_number from 4 for 4) as year, substring(slip_number from 9)::integer as number
    from public.harvest_records where slip_number ~ '^UP-[0-9]{4}-[0-9]+$'
    union all
    select substring(slip_number from 4 for 4), substring(slip_number from 9)::integer
    from public.payroll_corrections
    where transaction_kind = 'harvest' and slip_number ~ '^UP-[0-9]{4}-[0-9]+$'
  ) as existing_numbers
  group by year
), numbered as (
  select missing.id, 'UP-' || to_char(missing.harvest_date, 'YYYY') || '-'
    || lpad((coalesce(existing_max.max_number, 0) + missing.seq_no)::text,
      greatest(4, length((coalesce(existing_max.max_number, 0) + missing.seq_no)::text)), '0') as slip_number
  from missing
  left join existing_max on existing_max.year = to_char(missing.harvest_date, 'YYYY')
)
update public.harvest_records as records
set slip_number = numbered.slip_number
from numbered
where records.id = numbered.id;

do $$
begin
  perform set_config('arboria.backfill_slip', 'false', true);
end
$$;
alter table public.salary_payments alter column slip_number drop not null;
alter table public.harvest_records alter column slip_number drop not null;
create unique index if not exists salary_payments_slip_number_key
  on public.salary_payments (slip_number);
create unique index if not exists harvest_records_slip_number_key
  on public.harvest_records (slip_number);

create or replace function public.on_payroll_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_name text;
  is_salary boolean := tg_table_name = 'salary_payments';
  liability_account text := case when tg_table_name = 'salary_payments' then '2-101' else '2-102' end;
  journal_kind text := case when tg_table_name = 'salary_payments' then 'salary' else 'harvest' end;
  net_amount numeric(14, 2) := new.total_amount;
  journal_day date;
  base_description text;
begin
  select full_name into employee_name from public.employees where id = new.employee_id;
  if new.status = 'paid' and old.status = 'pending' then
    if new.total_amount > 0 then
      journal_day := coalesce(new.paid_at::date, current_date);
      base_description := case when is_salary then 'Gaji ' else 'Upah panen ' end || employee_name
        || ' - ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(new.period_id, 6, 2)::integer]
        || ' ' || substring(new.period_id, 1, 4);
      perform public.create_payroll_journal(journal_day, 'Pembayaran ' || base_description,
        'payment', journal_kind, new.id, jsonb_build_array(
          jsonb_build_object('account_code', liability_account, 'debit', net_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', net_amount)
        ));
    end if;
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action)
      values (journal_kind, new.id, 'dibayar');
  elsif new.status = 'cancelled' then
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason)
      values (journal_kind, new.id, 'dibatalkan', coalesce(new.cancelled_by, 'Admin Arboria'), new.cancellation_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_transaction_guard on public.salary_payments;
drop trigger if exists payroll_insert_guard on public.salary_payments;
create trigger payroll_insert_guard before insert on public.salary_payments
  for each row execute function public.guard_payroll_insert();
create trigger payroll_transaction_guard before update or delete on public.salary_payments
  for each row execute function public.guard_payroll_transaction();
drop trigger if exists payroll_transaction_guard on public.harvest_records;
drop trigger if exists payroll_insert_guard on public.harvest_records;
create trigger payroll_insert_guard before insert on public.harvest_records
  for each row execute function public.guard_payroll_insert();
create trigger payroll_transaction_guard before update or delete on public.harvest_records
  for each row execute function public.guard_payroll_transaction();
drop trigger if exists payroll_expense_journal on public.salary_payments;
create trigger payroll_expense_journal after insert on public.salary_payments
  for each row execute function public.write_payroll_expense_journal();
drop trigger if exists payroll_expense_journal on public.harvest_records;
create trigger payroll_expense_journal after insert on public.harvest_records
  for each row execute function public.write_payroll_expense_journal();
drop trigger if exists payroll_status_journal on public.salary_payments;
create trigger payroll_status_journal after update of status on public.salary_payments
  for each row when (old.status is distinct from new.status) execute function public.on_payroll_status_change();
drop trigger if exists payroll_status_journal on public.harvest_records;
create trigger payroll_status_journal after update of status on public.harvest_records
  for each row when (old.status is distinct from new.status) execute function public.on_payroll_status_change();

create or replace function public.cancel_payroll_transaction(
  transaction_type text,
  transaction_key uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row record;
  original_journal_ids uuid[];
  reversal_lines jsonb;
  reversal_journal_id uuid;
  transaction_table text;
  employee_name text;
  transaction_period text;
begin
  if transaction_type not in ('salary', 'harvest') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if nullif(trim(reason), '') is null then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  transaction_table := case when transaction_type = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select t.*, e.full_name from public.%I t join public.employees e on e.id = t.employee_id where t.id = $1 for update of t', transaction_table)
    into transaction_row using transaction_key;
  if transaction_row.id is null then raise exception 'Transaksi tidak ditemukan.'; end if;
  if transaction_row.status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan.'; end if;

  select array_agg(id order by journal_date, journal_number) into original_journal_ids
    from public.payroll_journals where transaction_id = transaction_key
      and journal_type <> 'reversal';
  if coalesce(array_length(original_journal_ids, 1), 0) = 0 then raise exception 'Jurnal transaksi tidak ditemukan.'; end if;
  select jsonb_agg(jsonb_build_object(
      'account_code', line.account_code,
      'debit', line.credit,
      'credit', line.debit
    ) order by
      case when line.credit > 0 then 0 else 1 end,
      array_position(original_journal_ids, journal.id),
      line.id)
    into reversal_lines
    from public.payroll_journal_lines line
    join public.payroll_journals journal on journal.id = line.journal_id
    where journal.id = any(original_journal_ids);
  if reversal_lines is null then raise exception 'Baris jurnal pembalik tidak dapat dibuat.'; end if;
  reversal_journal_id := public.create_payroll_journal(current_date,
    'Pembalik ' || transaction_row.slip_number || ': ' || trim(reason),
    'reversal', transaction_type, transaction_key, reversal_lines, original_journal_ids[1], trim(reason));

  perform set_config('arboria.allow_cancel', 'true', true);
  execute format('update public.%I set status = ''cancelled'', cancellation_reason = $2, cancelled_by = $3 where id = $1', transaction_table)
    using transaction_key, trim(reason), 'Admin Arboria';
  return reversal_journal_id;
end;
$$;

-- Existing payroll rows are journaled exactly once by these backfill inserts.
do $$
declare
  row_record record;
  employee_name text;
  gross_amount numeric(14, 2);
  expense_account text;
  liability_account text;
  transaction_kind text;
  expense_day date;
  journal_description text;
begin
  for row_record in select * from public.salary_payments where not exists (
    select 1 from public.payroll_journals journal
    where journal.transaction_id = salary_payments.id and journal.journal_type = 'salary'
  ) loop
    select full_name into employee_name from public.employees where id = row_record.employee_id;
    gross_amount := row_record.basic_salary + row_record.allowances;
    expense_day := row_record.payment_date;
    journal_description := 'Gaji ' || employee_name || ' - '
      || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(row_record.period_id, 6, 2)::integer]
      || ' ' || substring(row_record.period_id, 1, 4);
    perform public.create_payroll_journal(expense_day, journal_description, 'salary', 'salary',
      row_record.id, jsonb_build_array(
        jsonb_build_object('account_code', '5-101', 'debit', row_record.basic_salary, 'credit', 0),
        jsonb_build_object('account_code', '5-103', 'debit', row_record.allowances, 'credit', 0),
        jsonb_build_object('account_code', '5-104', 'debit', 0, 'credit', row_record.deductions),
        jsonb_build_object('account_code', '2-101', 'debit', 0, 'credit', row_record.total_amount)
      ));
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, occurred_at)
      values ('salary', row_record.id, 'dicatat', row_record.created_at);
    if row_record.status = 'paid' and row_record.total_amount > 0 then
      perform public.create_payroll_journal(coalesce(row_record.paid_at::date, expense_day),
        'Pembayaran ' || journal_description, 'payment', 'salary', row_record.id,
        jsonb_build_array(
          jsonb_build_object('account_code', '2-101', 'debit', row_record.total_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', row_record.total_amount)
        ));
    end if;
    if row_record.status = 'paid' then
      insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, occurred_at)
        values ('salary', row_record.id, 'dibayar', coalesce(row_record.paid_at, row_record.created_at));
    end if;
  end loop;
  for row_record in select * from public.harvest_records where not exists (
    select 1 from public.payroll_journals journal
    where journal.transaction_id = harvest_records.id and journal.journal_type = 'harvest'
  ) loop
    select full_name into employee_name from public.employees where id = row_record.employee_id;
    journal_description := 'Upah panen ' || employee_name || ' - '
      || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(row_record.period_id, 6, 2)::integer]
      || ' ' || substring(row_record.period_id, 1, 4);
    perform public.create_payroll_journal(row_record.harvest_date, journal_description, 'harvest', 'harvest',
      row_record.id, jsonb_build_array(
        jsonb_build_object('account_code', '5-102', 'debit', row_record.weight_kg * row_record.rate_per_kg, 'credit', 0),
        jsonb_build_object('account_code', '5-103', 'debit', 0, 'credit', row_record.deductions),
        jsonb_build_object('account_code', '2-102', 'debit', 0, 'credit', row_record.total_amount)
      ));
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, occurred_at)
      values ('harvest', row_record.id, 'dicatat', row_record.created_at);
    if row_record.status = 'paid' and row_record.total_amount > 0 then
      perform public.create_payroll_journal(coalesce(row_record.paid_at::date, row_record.harvest_date),
        'Pembayaran ' || journal_description, 'payment', 'harvest', row_record.id,
        jsonb_build_array(
          jsonb_build_object('account_code', '2-102', 'debit', row_record.total_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', row_record.total_amount)
        ));
    end if;
    if row_record.status = 'paid' then
      insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, occurred_at)
        values ('harvest', row_record.id, 'dibayar', coalesce(row_record.paid_at, row_record.created_at));
    end if;
  end loop;
end;
$$;

create table if not exists public.daily_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete restrict,
  attendance_date date not null,
  status text not null check (status in ('present', 'leave', 'absent')),
  recorded_by text not null default 'Admin Arboria',
  created_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);
create index if not exists daily_attendance_date_idx on public.daily_attendance (attendance_date, employee_id);

create or replace function public.guard_active_employee_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.employee_id is not distinct from old.employee_id then
    return new;
  end if;
  if exists (
    select 1 from public.employees
    where id = new.employee_id and archived_at is not null
  ) then
    raise exception 'Karyawan sudah dihapus dan tidak dapat menerima absensi baru.';
  end if;
  return new;
end;
$$;

drop trigger if exists active_employee_attendance_insert_guard on public.attendance_records;
create trigger active_employee_attendance_insert_guard
  before insert on public.attendance_records
  for each row execute function public.guard_active_employee_attendance();
drop trigger if exists active_employee_attendance_update_guard on public.attendance_records;
create trigger active_employee_attendance_update_guard
  before update of employee_id on public.attendance_records
  for each row execute function public.guard_active_employee_attendance();
drop trigger if exists active_employee_daily_attendance_insert_guard on public.daily_attendance;
create trigger active_employee_daily_attendance_insert_guard
  before insert on public.daily_attendance
  for each row execute function public.guard_active_employee_attendance();
drop trigger if exists active_employee_daily_attendance_update_guard on public.daily_attendance;
create trigger active_employee_daily_attendance_update_guard
  before update of employee_id on public.daily_attendance
  for each row execute function public.guard_active_employee_attendance();

alter table public.accounts enable row level security;
alter table public.payroll_journals enable row level security;
alter table public.payroll_journal_lines enable row level security;
alter table public.payroll_audit_trail enable row level security;
alter table public.daily_attendance enable row level security;
alter table public.harvest_blocks enable row level security;
grant select on public.accounts, public.payroll_journals, public.payroll_journal_lines, public.payroll_audit_trail to anon;
grant select on public.harvest_blocks to anon;
grant select, insert, update, delete on public.daily_attendance to anon;
revoke all on function public.create_payroll_journal(date, text, text, text, uuid, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.next_payroll_journal_number(date) from public, anon, authenticated;
revoke all on function public.cancel_payroll_transaction(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_payroll_transaction(text, uuid, text) to anon;
drop policy if exists "Public demo read" on public.accounts;
create policy "Public demo read" on public.accounts for select to anon using (true);
drop policy if exists "Public demo read" on public.payroll_journals;
create policy "Public demo read" on public.payroll_journals for select to anon using (true);
drop policy if exists "Public demo read" on public.payroll_journal_lines;
create policy "Public demo read" on public.payroll_journal_lines for select to anon using (true);
drop policy if exists "Public demo read" on public.payroll_audit_trail;
create policy "Public demo read" on public.payroll_audit_trail for select to anon using (true);
drop policy if exists "Public demo read" on public.harvest_blocks;
create policy "Public demo read" on public.harvest_blocks for select to anon using (true);
drop policy if exists "Public demo access" on public.daily_attendance;
create policy "Public demo access" on public.daily_attendance for all to anon using (true) with check (true);

notify pgrst, 'reload schema';

-- Koreksi adalah catatan tersendiri agar transaksi dan slip asli tetap immutable.
alter table public.payroll_corrections add column if not exists paid_with_original boolean not null default false;
alter table public.payroll_corrections alter column slip_number drop not null;
alter table public.payroll_journals alter column journal_number drop not null;

do $$
begin
  perform set_config('arboria.backfill_slip', 'true', true);
  update public.salary_payments
    set slip_number = null
    where slip_number is not null
      and (status = 'pending' or (status = 'cancelled' and paid_at is null));
  update public.harvest_records
    set slip_number = null
    where slip_number is not null
      and (status = 'pending' or (status = 'cancelled' and paid_at is null));
end
$$;
update public.payroll_corrections
set slip_number = null
where paid_with_original
   or net_amount <= 0
   or status in ('pending', 'overpaid')
   or (status = 'cancelled' and paid_at is null);

update public.payroll_journals journal
set journal_number = null
from public.salary_payments salary
where journal.transaction_kind = 'salary'
  and journal.transaction_id = salary.id
  and (salary.status = 'pending' or (salary.status = 'cancelled' and salary.paid_at is null));
update public.payroll_journals journal
set journal_number = null
from public.harvest_records harvest
where journal.transaction_kind = 'harvest'
  and journal.transaction_id = harvest.id
  and (harvest.status = 'pending' or (harvest.status = 'cancelled' and harvest.paid_at is null));
update public.payroll_journals journal
set journal_number = null
from public.payroll_corrections correction
where journal.transaction_id = correction.id and correction.slip_number is null;
update public.payroll_journals journal
set journal_number = salary.slip_number
from public.payroll_corrections correction
join public.salary_payments salary on salary.id = correction.original_transaction_id
where journal.transaction_id = correction.id and correction.transaction_kind = 'salary'
  and correction.paid_with_original;
update public.payroll_journals journal
set journal_number = harvest.slip_number
from public.payroll_corrections correction
join public.harvest_records harvest on harvest.id = correction.original_transaction_id
where journal.transaction_id = correction.id and correction.transaction_kind = 'harvest'
  and correction.paid_with_original;
update public.payroll_journals journal
set journal_number = salary.slip_number
from public.payroll_corrections correction
join public.salary_payments salary on salary.id = correction.original_transaction_id
where journal.transaction_id = correction.id and correction.transaction_kind = 'salary'
  and not correction.paid_with_original and correction.net_amount <= 0
  and salary.slip_number is not null;
update public.payroll_journals journal
set journal_number = harvest.slip_number
from public.payroll_corrections correction
join public.harvest_records harvest on harvest.id = correction.original_transaction_id
where journal.transaction_id = correction.id and correction.transaction_kind = 'harvest'
  and not correction.paid_with_original and correction.net_amount <= 0
  and harvest.slip_number is not null;

update public.payroll_audit_trail audit
set slip_number = null
where exists (
    select 1 from public.salary_payments salary
    where audit.transaction_kind = 'salary' and audit.transaction_id = salary.id
      and (salary.status = 'pending' or (salary.status = 'cancelled' and salary.paid_at is null))
  )
   or exists (
    select 1 from public.harvest_records harvest
    where audit.transaction_kind = 'harvest' and audit.transaction_id = harvest.id
      and (harvest.status = 'pending' or (harvest.status = 'cancelled' and harvest.paid_at is null))
  )
   or exists (
    select 1 from public.payroll_corrections correction
    where audit.transaction_id = correction.id and correction.slip_number is null
  );
update public.payroll_audit_trail audit
set slip_number = salary.slip_number
from public.payroll_corrections correction
join public.salary_payments salary on salary.id = correction.original_transaction_id
where audit.transaction_id = correction.id and correction.transaction_kind = 'salary'
  and correction.paid_with_original;
update public.payroll_audit_trail audit
set slip_number = harvest.slip_number
from public.payroll_corrections correction
join public.harvest_records harvest on harvest.id = correction.original_transaction_id
where audit.transaction_id = correction.id and correction.transaction_kind = 'harvest'
  and correction.paid_with_original;
update public.payroll_audit_trail audit
set slip_number = salary.slip_number
from public.payroll_corrections correction
join public.salary_payments salary on salary.id = correction.original_transaction_id
where audit.transaction_id = correction.id and correction.transaction_kind = 'salary'
  and not correction.paid_with_original and correction.net_amount <= 0
  and salary.slip_number is not null;
update public.payroll_audit_trail audit
set slip_number = harvest.slip_number
from public.payroll_corrections correction
join public.harvest_records harvest on harvest.id = correction.original_transaction_id
where audit.transaction_id = correction.id and correction.transaction_kind = 'harvest'
  and not correction.paid_with_original and correction.net_amount <= 0
  and harvest.slip_number is not null;

alter table public.payroll_journals drop constraint if exists payroll_journals_journal_type_check;
alter table public.payroll_journals add constraint payroll_journals_journal_type_check
  check (journal_type in ('salary', 'harvest', 'payment', 'correction', 'reversal'));
alter table public.payroll_audit_trail drop constraint if exists payroll_audit_trail_action_check;
alter table public.payroll_audit_trail add constraint payroll_audit_trail_action_check
  check (action in ('dicatat', 'dibayar', 'dikoreksi', 'dibatalkan'));
alter table public.payroll_audit_trail add column if not exists slip_number text;
update public.payroll_audit_trail audit
set slip_number = salary.slip_number
from public.salary_payments salary
where audit.transaction_kind = 'salary' and audit.transaction_id = salary.id
  and audit.slip_number is null;
update public.payroll_audit_trail audit
set slip_number = harvest.slip_number
from public.harvest_records harvest
where audit.transaction_kind = 'harvest' and audit.transaction_id = harvest.id
  and audit.slip_number is null;

create index if not exists payroll_corrections_original_idx
  on public.payroll_corrections (transaction_kind, original_transaction_id, created_at);
create index if not exists payroll_corrections_period_idx
  on public.payroll_corrections (period_id, correction_date);

alter table public.payroll_corrections enable row level security;
grant select on public.payroll_corrections to anon;
drop policy if exists "Public demo read" on public.payroll_corrections;
create policy "Public demo read" on public.payroll_corrections for select to anon using (true);

create or replace function public.next_payroll_slip_number(
  transaction_type text,
  transaction_day date
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  slip_prefix text;
  slip_year text := to_char(transaction_day, 'YYYY');
  next_number integer;
begin
  if transaction_type not in ('salary', 'harvest') then
    raise exception 'Jenis transaksi tidak valid untuk nomor slip.';
  end if;
  slip_prefix := case when transaction_type = 'salary' then 'GS' else 'UP' end;
  perform pg_advisory_xact_lock(hashtext('arboria-slip-' || slip_prefix || '-' || slip_year));
  if transaction_type = 'salary' then
    select greatest(
      coalesce((select max(substring(slip_number from 9)::integer) from public.salary_payments
        where slip_number ~ ('^GS-' || slip_year || '-[0-9]+$')), 0),
      coalesce((select max(substring(slip_number from 9)::integer) from public.payroll_corrections
        where transaction_kind = 'salary' and slip_number ~ ('^GS-' || slip_year || '-[0-9]+$')), 0)
    ) + 1 into next_number;
  else
    select greatest(
      coalesce((select max(substring(slip_number from 9)::integer) from public.harvest_records
        where slip_number ~ ('^UP-' || slip_year || '-[0-9]+$')), 0),
      coalesce((select max(substring(slip_number from 9)::integer) from public.payroll_corrections
        where transaction_kind = 'harvest' and slip_number ~ ('^UP-' || slip_year || '-[0-9]+$')), 0)
    ) + 1 into next_number;
  end if;
  return slip_prefix || '-' || slip_year || '-'
    || lpad(next_number::text, greatest(4, length(next_number::text)), '0');
end;
$$;

drop function if exists public.create_payroll_journal(date, text, text, text, uuid, jsonb, uuid, text);
create or replace function public.create_payroll_journal(
  journal_day date,
  journal_description text,
  journal_kind text,
  transaction_type text,
  transaction_key uuid,
  lines jsonb,
  reversal_key uuid default null,
  reason text default null,
  evidence_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_journal_id uuid;
  journal_number_value text := evidence_number;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
begin
  select coalesce(sum((line->>'debit')::numeric), 0),
         coalesce(sum((line->>'credit')::numeric), 0)
    into debit_total, credit_total
    from jsonb_array_elements(lines) as entries(line);
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Jurnal tidak seimbang: total debit % dan kredit %.', debit_total, credit_total;
  end if;
  if journal_number_value is null then
    if transaction_type = 'salary' then
      select slip_number into journal_number_value
      from public.salary_payments where id = transaction_key;
    elsif transaction_type = 'harvest' then
      select slip_number into journal_number_value
      from public.harvest_records where id = transaction_key;
    end if;
  end if;
  if journal_kind = 'payment' and nullif(journal_number_value, '') is null then
    raise exception 'Nomor slip wajib tersedia untuk jurnal pembayaran.';
  end if;
  insert into public.payroll_journals
    (journal_number, journal_date, description, journal_type, transaction_kind, transaction_id, reversal_of, cancellation_reason)
  values
    (journal_number_value, journal_day, journal_description, journal_kind, transaction_type, transaction_key, reversal_key, reason)
  returning id into new_journal_id;

  insert into public.payroll_journal_lines (journal_id, account_code, debit, credit, line_order)
  select new_journal_id, line->>'account_code',
         coalesce((line->>'debit')::numeric, 0), coalesce((line->>'credit')::numeric, 0),
         ordinality::integer
    from jsonb_array_elements(lines) with ordinality as entries(line, ordinality)
    where coalesce((line->>'debit')::numeric, 0) > 0 or coalesce((line->>'credit')::numeric, 0) > 0;
  return new_journal_id;
end;
$$;

create or replace function public.write_payroll_expense_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_name text;
  is_salary boolean := tg_table_name = 'salary_payments';
  gross_amount numeric(14, 2);
  net_amount numeric(14, 2);
  expense_account text;
  liability_account text;
  journal_kind text;
  journal_day date;
  journal_description text;
  journal_lines jsonb;
begin
  select full_name into employee_name from public.employees where id = new.employee_id;
  expense_account := case when is_salary then '5-101' else '5-102' end;
  liability_account := case when is_salary then '2-101' else '2-102' end;
  journal_kind := case when is_salary then 'salary' else 'harvest' end;
  net_amount := new.total_amount;
  if is_salary then
    gross_amount := new.basic_salary + new.allowances;
    journal_day := new.payment_date;
  else
    gross_amount := new.weight_kg * new.rate_per_kg;
    journal_day := new.harvest_date;
  end if;
  journal_description := case when is_salary then 'Gaji ' else 'Upah panen ' end
    || employee_name || ' - ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(new.period_id, 6, 2)::integer]
    || ' ' || substring(new.period_id, 1, 4);
  if is_salary then
    journal_lines := jsonb_build_array(
      jsonb_build_object('account_code', '5-101', 'debit', new.basic_salary, 'credit', 0),
      jsonb_build_object('account_code', '5-103', 'debit', new.allowances, 'credit', 0),
      jsonb_build_object('account_code', '5-104', 'debit', 0, 'credit', new.deductions),
      jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', net_amount)
    );
  else
    journal_lines := jsonb_build_array(
      jsonb_build_object('account_code', expense_account, 'debit', gross_amount, 'credit', 0),
      jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', net_amount)
    );
    if new.deductions > 0 then
      journal_lines := jsonb_insert(journal_lines, '{1}',
        jsonb_build_object('account_code', '5-103', 'debit', 0, 'credit', new.deductions));
    end if;
  end if;
  perform public.create_payroll_journal(journal_day, journal_description, journal_kind,
    journal_kind, new.id, journal_lines);
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
    values (journal_kind, new.id, 'dicatat', new.slip_number);

  if new.status = 'paid' then
    if new.total_amount > 0 then
      perform public.create_payroll_journal(coalesce(new.paid_at::date, journal_day),
        'Pembayaran ' || journal_description, 'payment', journal_kind, new.id,
        jsonb_build_array(
          jsonb_build_object('account_code', liability_account, 'debit', net_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', net_amount)
        ));
    end if;
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
      values (journal_kind, new.id, 'dibayar', new.slip_number);
  end if;
  return new;
end;
$$;

create or replace function public.on_payroll_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_salary boolean := tg_table_name = 'salary_payments';
  liability_account text := case when tg_table_name = 'salary_payments' then '2-101' else '2-102' end;
  journal_kind text := case when tg_table_name = 'salary_payments' then 'salary' else 'harvest' end;
  payable_amount numeric(14, 2) := new.total_amount;
  correction_total numeric(14, 2) := 0;
  journal_day date;
  base_description text;
  correction_row record;
begin
  if new.status = 'paid' and old.status = 'pending' then
    select coalesce(sum(net_amount), 0) into correction_total
      from public.payroll_corrections
      where transaction_kind = journal_kind
        and original_transaction_id = new.id
        and status = 'pending';
    payable_amount := new.total_amount + correction_total;
    if payable_amount < 0 then
      raise exception 'Koreksi menghasilkan jumlah pembayaran negatif. Batalkan atau periksa koreksi terlebih dahulu.';
    end if;
    select full_name into base_description from public.employees where id = new.employee_id;
    base_description := case when is_salary then 'Gaji ' else 'Upah panen ' end || base_description
      || ' - ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(new.period_id, 6, 2)::integer]
      || ' ' || substring(new.period_id, 1, 4);
    journal_day := coalesce(new.paid_at::date, current_date);
    if payable_amount > 0 then
      perform public.create_payroll_journal(journal_day, 'Pembayaran ' || base_description,
        'payment', journal_kind, new.id, jsonb_build_array(
          jsonb_build_object('account_code', liability_account, 'debit', payable_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', payable_amount)
        ));
    end if;
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
      values (journal_kind, new.id, 'dibayar', new.slip_number);
    for correction_row in
      update public.payroll_corrections
        set status = 'paid', paid_at = journal_day::timestamptz, paid_with_original = true
        where transaction_kind = journal_kind and original_transaction_id = new.id and status = 'pending'
        returning id
    loop
      update public.payroll_journals
        set journal_number = new.slip_number
        where transaction_id = correction_row.id and journal_type = 'correction';
      update public.payroll_audit_trail
        set slip_number = new.slip_number
        where transaction_id = correction_row.id;
      insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number, occurred_at)
        values (journal_kind, correction_row.id, 'dibayar', new.slip_number, journal_day::timestamptz);
    end loop;
    update public.payroll_journals
      set journal_number = new.slip_number
      where transaction_kind = journal_kind and transaction_id = new.id
        and journal_type in ('salary', 'harvest');
  elsif new.status = 'cancelled' then
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
      values (journal_kind, new.id, 'dibatalkan', coalesce(new.cancelled_by, 'Admin Arboria'), new.cancellation_reason, new.slip_number);
  end if;
  return new;
end;
$$;

create or replace function public.correct_payroll_transaction(
  transaction_type text,
  transaction_key uuid,
  correction_values jsonb,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_table text;
  transaction_row record;
  employee_name text;
  original_slip text;
  correction_id uuid;
  delta_basic numeric(14, 2) := 0;
  delta_allowances numeric(14, 2) := 0;
  delta_deductions numeric(14, 2) := 0;
  delta_gross numeric(14, 2) := 0;
  net_delta numeric(14, 2);
  active_basic numeric(14, 2) := 0;
  active_allowances numeric(14, 2) := 0;
  active_deductions numeric(14, 2) := 0;
  active_gross numeric(14, 2) := 0;
  target_basic numeric(14, 2);
  target_allowances numeric(14, 2);
  target_deductions numeric(14, 2);
  target_weight numeric(12, 2);
  target_rate numeric(14, 2);
  current_total numeric(14, 2);
  correction_status text;
  liability_account text;
  journal_lines jsonb := '[]'::jsonb;
  correction_description text;
begin
  if transaction_type not in ('salary', 'harvest') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if nullif(trim(reason), '') is null then raise exception 'Alasan koreksi wajib diisi.'; end if;
  if correction_values is null or jsonb_typeof(correction_values) <> 'object' then
    raise exception 'Rincian koreksi tidak valid.';
  end if;
  transaction_table := case when transaction_type = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select * from public.%I where id = $1 for update', transaction_table)
    into transaction_row using transaction_key;
  if transaction_row.id is null then raise exception 'Transaksi tidak ditemukan.'; end if;
  if transaction_row.status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan dan tidak dapat dikoreksi.'; end if;
  if transaction_row.status = 'paid' and exists (
    select 1 from public.payroll_corrections
    where transaction_kind = transaction_type
      and original_transaction_id = transaction_key
      and status = 'pending'
  ) then
    raise exception 'Selesaikan pembayaran koreksi yang tertunda sebelum membuat koreksi baru.';
  end if;
  select full_name into employee_name from public.employees where id = transaction_row.employee_id;
  original_slip := transaction_row.slip_number;
  liability_account := case when transaction_type = 'salary' then '2-101' else '2-102' end;

  if transaction_type = 'salary' then
    if not (correction_values ?& array['basic_salary', 'allowances', 'deductions']) then
      raise exception 'Gaji pokok, tunjangan, dan potongan wajib diisi.';
    end if;
    target_basic := round((correction_values->>'basic_salary')::numeric, 2);
    target_allowances := round((correction_values->>'allowances')::numeric, 2);
    target_deductions := round((correction_values->>'deductions')::numeric, 2);
    if target_basic is null or target_allowances is null or target_deductions is null
       or target_basic < 0 or target_allowances < 0 or target_deductions < 0
       or target_basic + target_allowances < target_deductions then
      raise exception 'Nilai gaji dan potongan tidak valid.';
    end if;
    correction_values := jsonb_build_object(
      'basic_salary', target_basic,
      'allowances', target_allowances,
      'deductions', target_deductions
    );
    select coalesce(sum(correction.delta_basic_salary), 0), coalesce(sum(correction.delta_allowances), 0),
           coalesce(sum(correction.delta_deductions), 0)
      into active_basic, active_allowances, active_deductions
      from public.payroll_corrections as correction
      where correction.transaction_kind = 'salary'
        and correction.original_transaction_id = transaction_key
        and correction.status <> 'cancelled';
    delta_basic := target_basic - transaction_row.basic_salary - active_basic;
    delta_allowances := target_allowances - transaction_row.allowances - active_allowances;
    delta_deductions := target_deductions - transaction_row.deductions - active_deductions;
    net_delta := delta_basic + delta_allowances - delta_deductions;
    current_total := transaction_row.total_amount + active_basic + active_allowances - active_deductions + net_delta;
    if delta_basic = 0 and delta_allowances = 0 and delta_deductions = 0 then
      raise exception 'Tidak ada perubahan nilai untuk dikoreksi.';
    end if;
    if transaction_row.status = 'pending' and current_total < 0 then
      raise exception 'Jumlah bersih setelah koreksi tidak boleh kurang dari nol.';
    end if;
    if delta_basic > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '5-101', 'debit', delta_basic, 'credit', 0),
        jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', delta_basic));
    elsif delta_basic < 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', liability_account, 'debit', abs(delta_basic), 'credit', 0),
        jsonb_build_object('account_code', '5-101', 'debit', 0, 'credit', abs(delta_basic)));
    end if;
    if delta_allowances > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '5-103', 'debit', delta_allowances, 'credit', 0),
        jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', delta_allowances));
    elsif delta_allowances < 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', liability_account, 'debit', abs(delta_allowances), 'credit', 0),
        jsonb_build_object('account_code', '5-103', 'debit', 0, 'credit', abs(delta_allowances)));
    end if;
    if delta_deductions > 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', liability_account, 'debit', delta_deductions, 'credit', 0),
        jsonb_build_object('account_code', '5-104', 'debit', 0, 'credit', delta_deductions));
    elsif delta_deductions < 0 then
      journal_lines := journal_lines || jsonb_build_array(
        jsonb_build_object('account_code', '5-104', 'debit', abs(delta_deductions), 'credit', 0),
        jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', abs(delta_deductions)));
    end if;
  else
    if not (correction_values ?& array['weight_kg', 'rate_per_kg']) then
      raise exception 'Bobot panen dan tarif per kg wajib diisi.';
    end if;
    target_weight := round((correction_values->>'weight_kg')::numeric, 2);
    target_rate := round((correction_values->>'rate_per_kg')::numeric, 2);
    if target_weight is null or target_rate is null or target_weight <= 0 or target_rate < 0 then
      raise exception 'Bobot dan tarif panen tidak valid.';
    end if;
    correction_values := jsonb_build_object('weight_kg', target_weight, 'rate_per_kg', target_rate);
    select coalesce(sum(correction.delta_gross), 0) into active_gross
      from public.payroll_corrections as correction
      where correction.transaction_kind = 'harvest'
        and correction.original_transaction_id = transaction_key
        and correction.status <> 'cancelled';
    delta_gross := target_weight * target_rate - transaction_row.weight_kg * transaction_row.rate_per_kg - active_gross;
    net_delta := delta_gross;
    current_total := transaction_row.total_amount + active_gross + net_delta;
    if delta_gross = 0 then raise exception 'Tidak ada perubahan nilai untuk dikoreksi.'; end if;
    if transaction_row.status = 'pending' and current_total < 0 then
      raise exception 'Jumlah bersih setelah koreksi tidak boleh kurang dari nol.';
    end if;
    if delta_gross > 0 then
      journal_lines := jsonb_build_array(
        jsonb_build_object('account_code', '5-102', 'debit', delta_gross, 'credit', 0),
        jsonb_build_object('account_code', liability_account, 'debit', 0, 'credit', delta_gross));
    else
      journal_lines := jsonb_build_array(
        jsonb_build_object('account_code', liability_account, 'debit', abs(delta_gross), 'credit', 0),
        jsonb_build_object('account_code', '5-102', 'debit', 0, 'credit', abs(delta_gross)));
    end if;
  end if;

  correction_status := case
    when transaction_row.status = 'pending' then 'pending'
    when net_delta > 0 then 'pending'
    when net_delta < 0 then 'overpaid'
    else 'paid'
  end;
  insert into public.payroll_corrections
    (transaction_kind, original_transaction_id, employee_id, period_id, correction_date,
     slip_number, correction_values, delta_basic_salary, delta_allowances, delta_deductions,
     delta_gross, net_amount, reason, status, paid_at)
  values
    (transaction_type, transaction_key, transaction_row.employee_id, transaction_row.period_id, current_date,
     null, correction_values, delta_basic, delta_allowances, delta_deductions,
     delta_gross, net_delta, trim(reason), correction_status,
     case when correction_status = 'paid' then now() else null end)
  returning id into correction_id;

  correction_description := case
    when correction_status = 'pending' then
      'Koreksi ' || employee_name || ' - ' || to_char(current_date, 'DD')
        || ' ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from current_date)::integer]
        || ' ' || to_char(current_date, 'YYYY') || ': ' || trim(reason)
    else 'Koreksi ' || original_slip || ': ' || trim(reason)
  end;
  select coalesce(jsonb_agg(item.value order by
      case when (item.value->>'debit')::numeric > 0 then 0 else 1 end,
      item.ordinality), '[]'::jsonb)
    into journal_lines
    from jsonb_array_elements(journal_lines) with ordinality as item(value, ordinality);
  perform public.create_payroll_journal(current_date, correction_description, 'correction',
    transaction_type, correction_id, journal_lines, null, trim(reason), original_slip);
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
    values (transaction_type, transaction_key, 'dikoreksi', 'Admin Arboria', trim(reason), original_slip);
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
    values (transaction_type, correction_id, 'dicatat', 'Admin Arboria', trim(reason), original_slip);
  if correction_status = 'overpaid' then
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
      values (transaction_type, correction_id, 'dikoreksi', 'Admin Arboria',
        'Kelebihan bayar ' || to_char(abs(net_delta), 'FM999G999G999G990D00'), original_slip);
  elsif correction_status = 'paid' then
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
      values (transaction_type, correction_id, 'dibayar', original_slip);
  end if;
  return correction_id;
end;
$$;

update public.payroll_journals journal
set description = 'Koreksi ' || employee.full_name || ' - '
  || to_char(correction.correction_date, 'DD')
  || ' ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from correction.correction_date)::integer]
  || ' ' || to_char(correction.correction_date, 'YYYY') || ': ' || correction.reason
from public.payroll_corrections correction
join public.employees employee on employee.id = correction.employee_id
where journal.journal_type = 'correction'
  and journal.transaction_id = correction.id
  and correction.status = 'pending'
  and correction.slip_number is null;

create or replace function public.payroll_correction_payment(correction_key uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  correction_row public.payroll_corrections%rowtype;
  source_status text;
  transaction_table text;
  liability_account text;
  correction_slip text;
  journal_date_value date := current_date;
begin
  select * into correction_row from public.payroll_corrections where id = correction_key for update;
  if correction_row.id is null then raise exception 'Transaksi koreksi tidak ditemukan.'; end if;
  if correction_row.status <> 'pending' or correction_row.net_amount <= 0 then
    raise exception 'Koreksi ini tidak memiliki utang yang menunggu pembayaran.';
  end if;
  transaction_table := case when correction_row.transaction_kind = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select status from public.%I where id = $1', transaction_table)
    into source_status using correction_row.original_transaction_id;
  if source_status is null then raise exception 'Transaksi asli tidak ditemukan.'; end if;
  if source_status = 'cancelled' then raise exception 'Transaksi asli sudah dibatalkan.'; end if;
  if source_status <> 'paid' then raise exception 'Bayarkan transaksi asli terlebih dahulu; nilai koreksi akan dibayar bersama.'; end if;
  liability_account := case when correction_row.transaction_kind = 'salary' then '2-101' else '2-102' end;
  correction_slip := public.next_payroll_slip_number(correction_row.transaction_kind, journal_date_value);
  perform public.create_payroll_journal(journal_date_value,
    'Pembayaran koreksi ' || correction_slip, 'payment',
    correction_row.transaction_kind, correction_row.id,
    jsonb_build_array(
      jsonb_build_object('account_code', liability_account, 'debit', correction_row.net_amount, 'credit', 0),
      jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', correction_row.net_amount)
    ), null, null, correction_slip);
  update public.payroll_corrections
    set status = 'paid', paid_at = now(), slip_number = correction_slip
    where id = correction_key;
  update public.payroll_journals
    set journal_number = correction_slip
    where transaction_id = correction_key and journal_type = 'correction';
  update public.payroll_audit_trail
    set slip_number = correction_slip
    where transaction_id = correction_key;
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
    values (correction_row.transaction_kind, correction_row.id, 'dibayar', correction_slip);
  return correction_key;
end;
$$;

create or replace function public.cancel_payroll_transaction(
  transaction_type text,
  transaction_key uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row record;
  original_journal_ids uuid[];
  reversal_lines jsonb;
  reversal_journal_id uuid;
  first_reversal_journal_id uuid;
  source_journal record;
  transaction_table text;
  reversal_description text;
  reversal_kind_label text;
  reason_value text;
  reversal_index integer := 0;
begin
  if transaction_type not in ('salary', 'harvest') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if nullif(trim(reason), '') is null then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  reason_value := trim(reason);
  transaction_table := case when transaction_type = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select t.*, e.full_name from public.%I t join public.employees e on e.id = t.employee_id where t.id = $1 for update of t', transaction_table)
    into transaction_row using transaction_key;
  if transaction_row.id is null then raise exception 'Transaksi tidak ditemukan.'; end if;
  if transaction_row.status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan.'; end if;

  select array_agg(journal.id order by journal.journal_date, journal.created_at, journal.id)
    into original_journal_ids
    from public.payroll_journals journal
    where journal.journal_type <> 'reversal'
      and (
        (journal.transaction_kind = transaction_type and journal.transaction_id = transaction_key)
        or journal.transaction_id in (
          select correction.id from public.payroll_corrections correction
          where correction.transaction_kind = transaction_type
            and correction.original_transaction_id = transaction_key
        )
      );
  if coalesce(array_length(original_journal_ids, 1), 0) = 0 then raise exception 'Jurnal transaksi tidak ditemukan.'; end if;
  for source_journal in
    select journal.id, journal.journal_type, journal.journal_number, journal.created_at
    from public.payroll_journals journal
    where journal.id = any(original_journal_ids)
    order by case
      when journal.journal_type in ('salary', 'harvest') then 0
      when journal.journal_type = 'payment' then 1
      when journal.journal_type = 'correction' then 2
      else 3
    end, journal.created_at, journal.id
  loop
    select jsonb_agg(jsonb_build_object(
        'account_code', line.account_code,
        'debit', line.credit,
        'credit', line.debit
      ) order by case when line.credit > 0 then 0 else 1 end, line.line_order, line.id)
      into reversal_lines
      from public.payroll_journal_lines line
      where line.journal_id = source_journal.id;
    if reversal_lines is null then
      raise exception 'Baris jurnal pembalik untuk jurnal % tidak ditemukan.', source_journal.id;
    end if;
    reversal_kind_label := case
      when source_journal.journal_type in ('salary', 'harvest') then 'Pengakuan'
      when source_journal.journal_type = 'payment' then 'Pembayaran'
      when source_journal.journal_type = 'correction' then 'Koreksi'
      else 'Jurnal'
    end;
    reversal_description := 'Pembalik ' || reversal_kind_label || ' '
      || coalesce(source_journal.journal_number, transaction_row.slip_number,
        transaction_row.full_name || ' - ' || transaction_row.period_id)
      || ': ' || reason_value;
    reversal_journal_id := public.create_payroll_journal(current_date,
      reversal_description, 'reversal', transaction_type, transaction_key,
      reversal_lines, source_journal.id, reason_value,
      coalesce(source_journal.journal_number, transaction_row.slip_number));
    update public.payroll_journals
      set created_at = now() + reversal_index * interval '1 microsecond'
      where id = reversal_journal_id;
    if first_reversal_journal_id is null then
      first_reversal_journal_id := reversal_journal_id;
    end if;
    reversal_index := reversal_index + 1;
  end loop;
  if first_reversal_journal_id is null then raise exception 'Jurnal pembalik tidak berhasil dibuat.'; end if;

  perform set_config('arboria.allow_cancel', 'true', true);
  execute format('update public.%I set status = ''cancelled'', cancellation_reason = $2, cancelled_by = $3 where id = $1', transaction_table)
    using transaction_key, reason_value, 'Admin Arboria';
  update public.payroll_corrections
    set status = 'cancelled'
    where transaction_kind = transaction_type and original_transaction_id = transaction_key
      and status <> 'cancelled';
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
    select correction.transaction_kind, correction.id, 'dibatalkan', 'Admin Arboria', reason_value, correction.slip_number
    from public.payroll_corrections
      as correction
    where correction.transaction_kind = transaction_type
      and correction.original_transaction_id = transaction_key;
  return first_reversal_journal_id;
end;
$$;

with ordered_lines as (
  select id,
    row_number() over (partition by journal_id order by line_order, id)::integer as next_order
  from public.payroll_journal_lines
)
update public.payroll_journal_lines line
set line_order = ordered_lines.next_order
from ordered_lines
where line.id = ordered_lines.id
  and line.line_order is distinct from ordered_lines.next_order;
create unique index if not exists payroll_journal_lines_journal_order_key
  on public.payroll_journal_lines (journal_id, line_order);

do $$
declare
  legacy_reversal record;
  source_journal record;
  reversal_lines jsonb;
  new_reversal_id uuid;
  reversal_kind_label text;
  reversal_index integer;
begin
  for legacy_reversal in
    select reversal.transaction_kind, reversal.transaction_id,
      min(reversal.journal_date) as journal_date,
      min(reversal.created_at) as created_at,
      max(reversal.cancellation_reason) as cancellation_reason,
      max(reversal.journal_number) as journal_number,
      max(reversal.created_by) as created_by
    from public.payroll_journals reversal
    where reversal.journal_type = 'reversal'
    group by reversal.transaction_kind, reversal.transaction_id
    having count(*) < (
      select count(*)
      from public.payroll_journals source
      where source.transaction_kind = reversal.transaction_kind
        and source.journal_type <> 'reversal'
        and (
          source.transaction_id = reversal.transaction_id
          or source.transaction_id in (
            select correction.id
            from public.payroll_corrections correction
            where correction.transaction_kind = reversal.transaction_kind
              and correction.original_transaction_id = reversal.transaction_id
          )
        )
    )
  loop
    delete from public.payroll_journal_lines line
    using public.payroll_journals reversal
    where line.journal_id = reversal.id
      and reversal.journal_type = 'reversal'
      and reversal.transaction_kind = legacy_reversal.transaction_kind
      and reversal.transaction_id = legacy_reversal.transaction_id;
    delete from public.payroll_journals reversal
    where reversal.journal_type = 'reversal'
      and reversal.transaction_kind = legacy_reversal.transaction_kind
      and reversal.transaction_id = legacy_reversal.transaction_id;

    reversal_index := 0;
    for source_journal in
      select source.id, source.journal_type, source.journal_number, source.created_at
      from public.payroll_journals source
      where source.transaction_kind = legacy_reversal.transaction_kind
        and source.journal_type <> 'reversal'
        and (
          source.transaction_id = legacy_reversal.transaction_id
          or source.transaction_id in (
            select correction.id
            from public.payroll_corrections correction
            where correction.transaction_kind = legacy_reversal.transaction_kind
              and correction.original_transaction_id = legacy_reversal.transaction_id
          )
        )
      order by case
        when source.journal_type in ('salary', 'harvest') then 0
        when source.journal_type = 'payment' then 1
        when source.journal_type = 'correction' then 2
        else 3
      end, source.created_at, source.id
    loop
      select jsonb_agg(jsonb_build_object(
          'account_code', line.account_code,
          'debit', line.credit,
          'credit', line.debit
        ) order by case when line.credit > 0 then 0 else 1 end, line.line_order, line.id)
        into reversal_lines
        from public.payroll_journal_lines line
        where line.journal_id = source_journal.id;
      if reversal_lines is null then
        raise exception 'Baris jurnal pembalik untuk jurnal % tidak ditemukan.', source_journal.id;
      end if;
      reversal_kind_label := case
        when source_journal.journal_type in ('salary', 'harvest') then 'Pengakuan'
        when source_journal.journal_type = 'payment' then 'Pembayaran'
        when source_journal.journal_type = 'correction' then 'Koreksi'
        else 'Jurnal'
      end;
      new_reversal_id := public.create_payroll_journal(
        legacy_reversal.journal_date,
        'Pembalik ' || reversal_kind_label || ' '
          || coalesce(source_journal.journal_number, legacy_reversal.journal_number, 'Tanpa nomor slip')
          || ': ' || coalesce(legacy_reversal.cancellation_reason, 'Pembatalan transaksi'),
        'reversal', legacy_reversal.transaction_kind, legacy_reversal.transaction_id,
        reversal_lines, source_journal.id, legacy_reversal.cancellation_reason,
        coalesce(source_journal.journal_number, legacy_reversal.journal_number));
      update public.payroll_journals
        set created_by = legacy_reversal.created_by,
            created_at = legacy_reversal.created_at + reversal_index * interval '1 microsecond'
        where id = new_reversal_id;
      reversal_index := reversal_index + 1;
    end loop;
  end loop;
end
$$;

revoke all on function public.create_payroll_journal(date, text, text, text, uuid, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.next_payroll_slip_number(text, date) from public, anon, authenticated;
revoke all on function public.cancel_payroll_transaction(text, uuid, text) from public, anon, authenticated;
revoke all on function public.correct_payroll_transaction(text, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.payroll_correction_payment(uuid) from public, anon, authenticated;
grant execute on function public.next_payroll_slip_number(text, date) to anon;
grant execute on function public.cancel_payroll_transaction(text, uuid, text) to anon;
grant execute on function public.correct_payroll_transaction(text, uuid, jsonb, text) to anon;
grant execute on function public.payroll_correction_payment(uuid) to anon;

notify pgrst, 'reload schema';

-- Run once after backend/schema.sql. The three public views preserve the
-- existing SQL/application interface while payroll_records stores all rows.
begin;

create table public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('journal', 'journal_line', 'correction')),
  employee_id uuid references public.employees(id) on delete restrict,
  journal_id uuid references public.payroll_records(id) on delete restrict,
  account_code text references public.accounts(code) on delete restrict,
  related_journal_id uuid references public.payroll_records(id) on delete restrict,
  data jsonb not null default '{}'::jsonb,
  description text generated always as (
    case when record_type = 'journal' then data->>'description' end
  ) stored,
  record_type_order smallint generated always as (
    case record_type
      when 'journal' then 1::smallint
      when 'journal_line' then 2::smallint
      when 'correction' then 3::smallint
    end
  ) stored,
  created_at timestamptz not null default now(),
  check (
    (record_type = 'journal'
      and employee_id is null and journal_id is null and account_code is null
      and data ?& array['journal_date', 'description', 'journal_type', 'created_by']
      and data->>'journal_date' is not null
      and data->>'description' is not null
      and data->>'journal_type' is not null
      and data->>'journal_type' in ('salary', 'harvest', 'payment', 'correction', 'reversal')
      and data->>'created_by' is not null
      and (data->>'transaction_kind' is null or data->>'transaction_kind' in ('salary', 'harvest')))
    or
    (record_type = 'journal_line'
      and employee_id is null and journal_id is not null and account_code is not null
      and related_journal_id is null
      and data ?& array['debit', 'credit', 'line_order']
      and data->>'debit' is not null
      and data->>'credit' is not null
      and data->>'line_order' is not null
      and (data->>'debit')::numeric >= 0
      and (data->>'credit')::numeric >= 0
      and ((data->>'debit')::numeric > 0) <> ((data->>'credit')::numeric > 0))
    or
    (record_type = 'correction'
      and employee_id is not null and journal_id is null and account_code is null
      and related_journal_id is null
      and data ?& array[
        'transaction_kind', 'original_transaction_id', 'period_id', 'correction_date',
        'correction_values', 'delta_basic_salary', 'delta_allowances',
        'delta_deductions', 'delta_gross', 'net_amount', 'reason', 'status',
        'created_by', 'paid_with_original'
      ]
      and data->>'transaction_kind' is not null
      and data->>'transaction_kind' in ('salary', 'harvest')
      and data->>'original_transaction_id' is not null
      and data->>'period_id' ~ '^\d{4}-(0[1-9]|1[0-2])$'
      and data->>'correction_date' is not null
      and data->>'correction_values' is not null
      and data->>'delta_basic_salary' is not null
      and data->>'delta_allowances' is not null
      and data->>'delta_deductions' is not null
      and data->>'delta_gross' is not null
      and data->>'status' in ('pending', 'paid', 'overpaid', 'cancelled')
      and data->>'status' is not null
      and data->>'net_amount' is not null
      and data->>'reason' is not null
      and data->>'created_by' is not null
      and data->>'paid_with_original' in ('true', 'false'))
  )
);

insert into public.payroll_records
  (id, record_type, related_journal_id, data, created_at)
select id, 'journal', null,
  jsonb_build_object(
    'journal_number', journal_number,
    'journal_date', journal_date,
    'description', description,
    'journal_type', journal_type,
    'transaction_kind', transaction_kind,
    'transaction_id', transaction_id,
    'cancellation_reason', cancellation_reason,
    'created_by', created_by
  ),
  created_at
from public.payroll_journals;

update public.payroll_records record
set related_journal_id = journal.reversal_of
from public.payroll_journals journal
where record.id = journal.id
  and record.record_type = 'journal'
  and journal.reversal_of is not null;

insert into public.payroll_records
  (id, record_type, journal_id, account_code, data)
select id, 'journal_line', journal_id, account_code,
  jsonb_build_object('debit', debit, 'credit', credit, 'line_order', line_order)
from public.payroll_journal_lines;

insert into public.payroll_records
  (id, record_type, employee_id, data, created_at)
select id, 'correction', employee_id,
  jsonb_build_object(
    'transaction_kind', transaction_kind,
    'original_transaction_id', original_transaction_id,
    'period_id', period_id,
    'correction_date', correction_date,
    'slip_number', slip_number,
    'correction_values', correction_values,
    'delta_basic_salary', delta_basic_salary,
    'delta_allowances', delta_allowances,
    'delta_deductions', delta_deductions,
    'delta_gross', delta_gross,
    'net_amount', net_amount,
    'reason', reason,
    'status', status,
    'paid_at', paid_at,
    'paid_with_original', paid_with_original,
    'created_by', created_by
  ),
  created_at
from public.payroll_corrections;

do $$
begin
  if (select count(*) from public.payroll_journals)
       <> (select count(*) from public.payroll_records where record_type = 'journal')
    or (select count(*) from public.payroll_journal_lines)
       <> (select count(*) from public.payroll_records where record_type = 'journal_line')
    or (select count(*) from public.payroll_corrections)
       <> (select count(*) from public.payroll_records where record_type = 'correction') then
    raise exception 'Payroll consolidation row counts do not match; migration cancelled.';
  end if;
end
$$;

create index payroll_records_journal_date_idx
  on public.payroll_records ((data->>'journal_date'), (data->>'journal_number'))
  where record_type = 'journal';
create index payroll_records_transaction_idx
  on public.payroll_records ((data->>'transaction_id'))
  where record_type = 'journal';
create index payroll_records_line_account_idx
  on public.payroll_records (account_code, journal_id)
  where record_type = 'journal_line';
create unique index payroll_records_line_order_key
  on public.payroll_records (journal_id, ((data->>'line_order')::integer))
  where record_type = 'journal_line';
create index payroll_records_correction_original_idx
  on public.payroll_records ((data->>'transaction_kind'), (data->>'original_transaction_id'), created_at)
  where record_type = 'correction';
create index payroll_records_correction_period_idx
  on public.payroll_records ((data->>'period_id'), (data->>'correction_date'))
  where record_type = 'correction';
create unique index payroll_records_correction_slip_key
  on public.payroll_records ((data->>'slip_number'))
  where record_type = 'correction' and data->>'slip_number' is not null;

drop function public.payroll_correction_payment(uuid);

drop table public.payroll_journal_lines;
drop table public.payroll_corrections;
drop table public.payroll_journals;

create view public.payroll_journals as
select id,
  data->>'journal_number' as journal_number,
  (data->>'journal_date')::date as journal_date,
  data->>'description' as description,
  data->>'journal_type' as journal_type,
  data->>'transaction_kind' as transaction_kind,
  (data->>'transaction_id')::uuid as transaction_id,
  related_journal_id as reversal_of,
  data->>'cancellation_reason' as cancellation_reason,
  data->>'created_by' as created_by,
  created_at
from public.payroll_records
where record_type = 'journal';

create view public.payroll_journal_lines as
select id,
  journal_id,
  account_code,
  (data->>'debit')::numeric(14, 2) as debit,
  (data->>'credit')::numeric(14, 2) as credit,
  (data->>'line_order')::integer as line_order
from public.payroll_records
where record_type = 'journal_line';

create view public.payroll_corrections as
select id,
  data->>'transaction_kind' as transaction_kind,
  (data->>'original_transaction_id')::uuid as original_transaction_id,
  employee_id,
  data->>'period_id' as period_id,
  (data->>'correction_date')::date as correction_date,
  data->>'slip_number' as slip_number,
  data->'correction_values' as correction_values,
  (data->>'delta_basic_salary')::numeric(14, 2) as delta_basic_salary,
  (data->>'delta_allowances')::numeric(14, 2) as delta_allowances,
  (data->>'delta_deductions')::numeric(14, 2) as delta_deductions,
  (data->>'delta_gross')::numeric(14, 2) as delta_gross,
  (data->>'net_amount')::numeric(14, 2) as net_amount,
  data->>'reason' as reason,
  data->>'status' as status,
  (data->>'paid_at')::timestamptz as paid_at,
  (data->>'paid_with_original')::boolean as paid_with_original,
  data->>'created_by' as created_by,
  created_at
from public.payroll_records
where record_type = 'correction';

create or replace function public.write_payroll_compatibility_view()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_kind text;
  row_json jsonb;
  row_data jsonb;
  row_id uuid;
  employee_key uuid;
  journal_key uuid;
  account_key text;
  related_journal_key uuid;
  record_created_at timestamptz;
  stored_row public.payroll_records%rowtype;
begin
  row_kind := case tg_table_name
    when 'payroll_journals' then 'journal'
    when 'payroll_journal_lines' then 'journal_line'
    when 'payroll_corrections' then 'correction'
    else null
  end;
  if row_kind is null then
    raise exception 'Unsupported payroll compatibility view: %', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    delete from public.payroll_records
    where id = old.id and record_type = row_kind;
    return old;
  end if;

  row_json := to_jsonb(new);
  row_id := coalesce(nullif(row_json->>'id', '')::uuid, gen_random_uuid());
  record_created_at := coalesce(nullif(row_json->>'created_at', '')::timestamptz, now());
  if tg_op = 'UPDATE' and not (row_json ? 'created_at') then
    select created_at into record_created_at
    from public.payroll_records
    where id = old.id and record_type = row_kind;
  end if;

  if row_kind = 'journal' then
    row_data := row_json - array['id', 'reversal_of', 'created_at'];
    related_journal_key := nullif(row_json->>'reversal_of', '')::uuid;
    row_data := row_data || jsonb_build_object(
      'created_by', coalesce(nullif(row_data->>'created_by', ''), 'Admin Arboria')
    );
    if related_journal_key is not null and not exists (
      select 1 from public.payroll_records
      where id = related_journal_key and record_type = 'journal'
    ) then
      raise exception 'Jurnal pembalik harus merujuk ke jurnal yang ada.';
    end if;
  elsif row_kind = 'journal_line' then
    row_data := row_json - array['id', 'journal_id', 'account_code'];
    journal_key := nullif(row_json->>'journal_id', '')::uuid;
    account_key := row_json->>'account_code';
    row_data := row_data || jsonb_build_object(
      'debit', coalesce(nullif(row_data->>'debit', '')::numeric, 0),
      'credit', coalesce(nullif(row_data->>'credit', '')::numeric, 0),
      'line_order', coalesce(nullif(row_data->>'line_order', '')::integer, 0)
    );
    if not exists (
      select 1 from public.payroll_records
      where id = journal_key and record_type = 'journal'
    ) then
      raise exception 'Baris jurnal harus merujuk ke header jurnal yang ada.';
    end if;
  else
    row_data := row_json - array['id', 'employee_id', 'created_at'];
    employee_key := nullif(row_json->>'employee_id', '')::uuid;
    row_data := row_data || jsonb_build_object(
      'correction_date', coalesce(nullif(row_data->>'correction_date', '')::date, current_date),
      'delta_basic_salary', coalesce(nullif(row_data->>'delta_basic_salary', '')::numeric, 0),
      'delta_allowances', coalesce(nullif(row_data->>'delta_allowances', '')::numeric, 0),
      'delta_deductions', coalesce(nullif(row_data->>'delta_deductions', '')::numeric, 0),
      'delta_gross', coalesce(nullif(row_data->>'delta_gross', '')::numeric, 0),
      'paid_with_original', coalesce(nullif(row_data->>'paid_with_original', '')::boolean, false),
      'created_by', coalesce(nullif(row_data->>'created_by', ''), 'Admin Arboria')
    );
  end if;

  if tg_op = 'INSERT' then
    insert into public.payroll_records
      (id, record_type, employee_id, journal_id, account_code,
       related_journal_id, data, created_at)
    values
      (row_id, row_kind, employee_key, journal_key, account_key,
       related_journal_key, row_data, record_created_at);
  else
    update public.payroll_records
    set employee_id = case when row_kind = 'correction' then employee_key else null end,
        journal_id = case when row_kind = 'journal_line' then journal_key else null end,
        account_code = case when row_kind = 'journal_line' then account_key else null end,
        related_journal_id = case when row_kind = 'journal' then related_journal_key else null end,
        data = row_data,
        created_at = record_created_at
    where id = old.id and record_type = row_kind
    returning * into stored_row;
    if not found then
      raise exception 'Payroll record % tidak ditemukan.', old.id;
    end if;
    row_id := stored_row.id;
  end if;

  execute format('select * from %I.%I where id = $1', tg_table_schema, tg_table_name)
    into new using row_id;
  return new;
end;
$$;

create trigger payroll_journals_write
  instead of insert or update or delete on public.payroll_journals
  for each row execute function public.write_payroll_compatibility_view();
create trigger payroll_journal_lines_write
  instead of insert or update or delete on public.payroll_journal_lines
  for each row execute function public.write_payroll_compatibility_view();
create trigger payroll_corrections_write
  instead of insert or update or delete on public.payroll_corrections
  for each row execute function public.write_payroll_compatibility_view();

alter table public.payroll_records enable row level security;
drop policy if exists "Public demo read" on public.payroll_records;
create policy "Public demo read" on public.payroll_records
  for select to anon using (true);
grant select on public.payroll_journals, public.payroll_journal_lines, public.payroll_corrections to anon;

create function public.payroll_correction_payment(correction_key uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  correction_row record;
  source_status text;
  transaction_table text;
  liability_account text;
  correction_slip text;
  journal_date_value date := current_date;
begin
  perform 1 from public.payroll_records
  where id = correction_key and record_type = 'correction'
  for update;
  select * into correction_row from public.payroll_corrections where id = correction_key;
  if correction_row.id is null then raise exception 'Transaksi koreksi tidak ditemukan.'; end if;
  if correction_row.status <> 'pending' or correction_row.net_amount <= 0 then
    raise exception 'Koreksi ini tidak memiliki utang yang menunggu pembayaran.';
  end if;
  transaction_table := case when correction_row.transaction_kind = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select status from public.%I where id = $1', transaction_table)
    into source_status using correction_row.original_transaction_id;
  if source_status is null then raise exception 'Transaksi asli tidak ditemukan.'; end if;
  if source_status = 'cancelled' then raise exception 'Transaksi asli sudah dibatalkan.'; end if;
  if source_status <> 'paid' then raise exception 'Bayarkan transaksi asli terlebih dahulu; nilai koreksi akan dibayar bersama.'; end if;
  liability_account := case when correction_row.transaction_kind = 'salary' then '2-101' else '2-102' end;
  correction_slip := public.next_payroll_slip_number(correction_row.transaction_kind, journal_date_value);
  perform public.create_payroll_journal(journal_date_value,
    'Pembayaran koreksi ' || correction_slip, 'payment',
    correction_row.transaction_kind, correction_row.id,
    jsonb_build_array(
      jsonb_build_object('account_code', liability_account, 'debit', correction_row.net_amount, 'credit', 0),
      jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', correction_row.net_amount)
    ), null, null, correction_slip);
  update public.payroll_corrections
    set status = 'paid', paid_at = now(), slip_number = correction_slip
    where id = correction_key;
  update public.payroll_journals
    set journal_number = correction_slip
    where transaction_id = correction_key and journal_type = 'correction';
  update public.payroll_audit_trail
    set slip_number = correction_slip
    where transaction_id = correction_key;
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
    values (correction_row.transaction_kind, correction_row.id, 'dibayar', correction_slip);
  return correction_key;
end;
$$;

revoke all on function public.write_payroll_compatibility_view() from public, anon, authenticated;
revoke all on function public.payroll_correction_payment(uuid) from public, anon, authenticated;
grant execute on function public.payroll_correction_payment(uuid) to anon;

notify pgrst, 'reload schema';
commit;

-- Move compatibility views out of public and give the unified table its
-- requested public name. Run this block alone to upgrade an already
-- consolidated project.
begin;

create schema if not exists private;
grant usage on schema private to postgres;
revoke all on schema private from public, anon, authenticated;

alter view public.payroll_journal_lines set schema private;
alter view public.payroll_corrections set schema private;
alter view public.payroll_journals set schema private;
alter table public.payroll_records rename to payroll_journals;

revoke all on private.payroll_journal_lines, private.payroll_corrections, private.payroll_journals
  from public, anon, authenticated;
grant select on public.payroll_journals to anon;

do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and (
        p.prosrc like '%public.payroll_journals%'
        or p.prosrc like '%public.payroll_journal_lines%'
        or p.prosrc like '%public.payroll_corrections%'
        or p.prosrc like '%public.payroll_records%'
      )
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(definition, 'public.payroll_journal_lines', 'private.payroll_journal_lines');
    definition := replace(definition, 'public.payroll_corrections', 'private.payroll_corrections');
    definition := replace(definition, 'public.payroll_journals', 'private.payroll_journals');
    if routine.proname in ('write_payroll_compatibility_view', 'payroll_correction_payment') then
      definition := replace(definition, 'public.payroll_records', 'public.payroll_journals');
    end if;
    execute definition;
  end loop;
end
$$;

notify pgrst, 'reload schema';
commit;

-- Fix the return row shape for compatibility-view triggers on already
-- consolidated projects. Run this block alone when applying the fix.
do $$
declare
  definition text;
  original_clause text := 'select * from public.%I where id = $1'', tg_table_name)';
  fixed_clause text := 'select * from %I.%I where id = $1'', tg_table_schema, tg_table_name)';
begin
  definition := pg_get_functiondef('public.write_payroll_compatibility_view()'::regprocedure);
  if strpos(definition, original_clause) > 0 then
    execute replace(definition, original_clause, fixed_clause);
  elsif strpos(definition, fixed_clause) = 0 then
    raise exception 'Fungsi write_payroll_compatibility_view tidak memiliki query return row yang dikenali.';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Fix cancellation on projects where the payroll compatibility views have
-- already moved to the private schema. Run this block alone to upgrade them.
do $$
declare
  definition text;
  original_clause text := 'line.line_order, line.ctid';
  fixed_clause text := 'line.line_order, line.id';
begin
  definition := pg_get_functiondef('public.cancel_payroll_transaction(text, uuid, text)'::regprocedure);
  if strpos(definition, original_clause) > 0 then
    execute replace(definition, original_clause, fixed_clause);
  elsif strpos(definition, fixed_clause) = 0 then
    raise exception 'Fungsi cancel_payroll_transaction tidak memiliki urutan baris jurnal yang dikenali.';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Expose the journal header description directly in the consolidated table.
drop view if exists public.payroll_journal_entries;
alter table public.payroll_journals
  add column if not exists description text generated always as (
    case when record_type = 'journal' then data->>'description' end
  ) stored;
comment on column public.payroll_journals.description is
  'Keterangan jurnal; terisi pada record_type journal.';
alter table public.payroll_journals
  add column if not exists record_type_order smallint generated always as (
    case record_type
      when 'journal' then 1::smallint
      when 'journal_line' then 2::smallint
      when 'correction' then 3::smallint
    end
  ) stored;
comment on column public.payroll_journals.record_type_order is
  'Urutan tampilan: journal=1, journal_line=2, correction=3.';
notify pgrst, 'reload schema';


-- ==================== BACKUP BLOCK ====================
-- Existing consolidated project: run this block alone before migration.
-- Run this first while application writes are paused.
-- The snapshots are intentionally kept outside public and are never overwritten.
begin;

create schema if not exists migration_backup;
revoke all on schema migration_backup from public, anon, authenticated;

lock table public.payroll_journals, public.salary_payments, public.harvest_records,
  public.payroll_audit_trail, public.accounts, public.employees
  in share mode;

do $$
begin
  if to_regclass('migration_backup.payroll_journals_20261123') is not null
    or to_regclass('migration_backup.salary_payments_20261123') is not null
    or to_regclass('migration_backup.harvest_records_20261123') is not null
    or to_regclass('migration_backup.payroll_audit_trail_20261123') is not null
    or to_regclass('migration_backup.accounts_20261123') is not null
    or to_regclass('migration_backup.employees_20261123') is not null then
    raise exception 'Backup 20261123 already exists. Do not overwrite it; choose a new suffix after reviewing the existing backup.';
  end if;
end
$$;

create table migration_backup.payroll_journals_20261123
  as select * from public.payroll_journals;
create table migration_backup.salary_payments_20261123
  as select * from public.salary_payments;
create table migration_backup.harvest_records_20261123
  as select * from public.harvest_records;
create table migration_backup.payroll_audit_trail_20261123
  as select * from public.payroll_audit_trail;
create table migration_backup.accounts_20261123
  as select * from public.accounts;
create table migration_backup.employees_20261123
  as select * from public.employees;

revoke all on all tables in schema migration_backup from public, anon, authenticated;

do $$
begin
  if (select count(*) from public.payroll_journals)
       <> (select count(*) from migration_backup.payroll_journals_20261123)
    or (select count(*) from public.salary_payments)
       <> (select count(*) from migration_backup.salary_payments_20261123)
    or (select count(*) from public.harvest_records)
       <> (select count(*) from migration_backup.harvest_records_20261123)
    or (select count(*) from public.payroll_audit_trail)
       <> (select count(*) from migration_backup.payroll_audit_trail_20261123)
    or (select count(*) from public.accounts)
       <> (select count(*) from migration_backup.accounts_20261123)
    or (select count(*) from public.employees)
       <> (select count(*) from migration_backup.employees_20261123) then
    raise exception 'Backup row counts do not match source tables.';
  end if;
end
$$;

commit;

select 'payroll_journals' as table_name,
  (select count(*) from public.payroll_journals) as source_rows,
  (select count(*) from migration_backup.payroll_journals_20261123) as backup_rows
union all
select 'salary_payments',
  (select count(*) from public.salary_payments),
  (select count(*) from migration_backup.salary_payments_20261123)
union all
select 'harvest_records',
  (select count(*) from public.harvest_records),
  (select count(*) from migration_backup.harvest_records_20261123)
union all
select 'payroll_audit_trail',
  (select count(*) from public.payroll_audit_trail),
  (select count(*) from migration_backup.payroll_audit_trail_20261123)
union all
select 'accounts',
  (select count(*) from public.accounts),
  (select count(*) from migration_backup.accounts_20261123)
union all
select 'employees',
  (select count(*) from public.employees),
  (select count(*) from migration_backup.employees_20261123);

-- ================== END BACKUP BLOCK ==================

-- =========== NORMALIZATION MIGRATION BLOCK ===========
-- Existing consolidated project: run this block alone after backup.
-- Run after the BACKUP BLOCK above while application writes are paused.
-- This migration keeps public.payroll_journals intact as the legacy source.
begin;

lock table public.payroll_journals, public.salary_payments, public.harvest_records,
  public.payroll_audit_trail, public.accounts, public.employees
  in share row exclusive mode;

do $$
begin
  if to_regclass('migration_backup.payroll_journals_20261123') is null
    or to_regclass('migration_backup.salary_payments_20261123') is null
    or to_regclass('migration_backup.harvest_records_20261123') is null
    or to_regclass('migration_backup.payroll_audit_trail_20261123') is null
    or to_regclass('migration_backup.accounts_20261123') is null
    or to_regclass('migration_backup.employees_20261123') is null then
    raise exception 'Required backup snapshots are missing. Run the BACKUP BLOCK at the end of backend/schema.sql first.';
  end if;
  if to_regclass('public.journals') is not null
    or to_regclass('public.journal_lines') is not null
    or to_regclass('public.payroll_corrections') is not null then
    raise exception 'A normalized journal table already exists. Stop and inspect before rerunning this migration.';
  end if;
end
$$;

create table public.payroll_corrections (
  id uuid primary key default gen_random_uuid(),
  transaction_kind text not null check (transaction_kind in ('salary', 'harvest')),
  original_transaction_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_id text not null check (period_id ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  correction_date date not null,
  slip_number text unique,
  target_basic_salary numeric(14, 2),
  target_allowances numeric(14, 2),
  target_deductions numeric(14, 2),
  target_weight_kg numeric(12, 2),
  target_rate_per_kg numeric(14, 2),
  delta_basic_salary numeric(14, 2) not null default 0,
  delta_allowances numeric(14, 2) not null default 0,
  delta_deductions numeric(14, 2) not null default 0,
  delta_gross numeric(14, 2) not null default 0,
  net_amount numeric(14, 2) not null,
  reason text not null,
  status text not null check (status in ('pending', 'paid', 'overpaid', 'cancelled')),
  paid_at timestamptz,
  paid_with_original boolean not null default false,
  created_by text not null default 'Admin Arboria',
  created_at timestamptz not null default now(),
  check (
    (transaction_kind = 'salary'
      and target_basic_salary is not null
      and target_allowances is not null
      and target_deductions is not null
      and target_weight_kg is null
      and target_rate_per_kg is null)
    or
    (transaction_kind = 'harvest'
      and target_basic_salary is null
      and target_allowances is null
      and target_deductions is null
      and target_weight_kg is not null
      and target_rate_per_kg is not null)
  )
);

create table public.journals (
  id uuid primary key default gen_random_uuid(),
  journal_number text,
  journal_date date not null,
  journal_type text not null check (journal_type in ('recognition', 'payment', 'correction', 'reversal')),
  transaction_kind text check (transaction_kind in ('salary', 'harvest')),
  transaction_id uuid,
  correction_id uuid references public.payroll_corrections(id) on delete restrict,
  reverses_journal_id uuid,
  reason text,
  description text not null,
  created_by text not null default 'Admin Arboria',
  created_at timestamptz not null default now(),
  constraint journals_reverses_fk
    foreign key (reverses_journal_id) references public.journals(id)
    on delete restrict deferrable initially deferred
);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.journals(id) on delete restrict,
  line_order integer not null,
  account_code text not null references public.accounts(code) on delete restrict,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  constraint journal_lines_one_side_check
    check (not (debit > 0 and credit > 0)),
  constraint journal_lines_order_key unique (journal_id, line_order)
);

create index journals_date_number_idx on public.journals (journal_date, journal_number);
create index journals_transaction_idx on public.journals (transaction_kind, transaction_id);
create index journals_correction_idx on public.journals (correction_id) where correction_id is not null;
create index journals_reverses_idx on public.journals (reverses_journal_id) where reverses_journal_id is not null;
create index journal_lines_account_idx on public.journal_lines (account_code, journal_id);
create index payroll_corrections_original_idx
  on public.payroll_corrections (transaction_kind, original_transaction_id, created_at);
create index payroll_corrections_period_idx
  on public.payroll_corrections (period_id, correction_date);

insert into public.payroll_corrections (
  id, transaction_kind, original_transaction_id, employee_id, period_id,
  correction_date, slip_number, target_basic_salary, target_allowances,
  target_deductions, target_weight_kg, target_rate_per_kg,
  delta_basic_salary, delta_allowances, delta_deductions, delta_gross,
  net_amount, reason, status, paid_at, paid_with_original, created_by, created_at
)
select
  id,
  data->>'transaction_kind',
  (data->>'original_transaction_id')::uuid,
  employee_id,
  data->>'period_id',
  (data->>'correction_date')::date,
  nullif(data->>'slip_number', ''),
  case when data->>'transaction_kind' = 'salary'
    then (data->'correction_values'->>'basic_salary')::numeric(14, 2) end,
  case when data->>'transaction_kind' = 'salary'
    then (data->'correction_values'->>'allowances')::numeric(14, 2) end,
  case when data->>'transaction_kind' = 'salary'
    then (data->'correction_values'->>'deductions')::numeric(14, 2) end,
  case when data->>'transaction_kind' = 'harvest'
    then (data->'correction_values'->>'weight_kg')::numeric(12, 2) end,
  case when data->>'transaction_kind' = 'harvest'
    then (data->'correction_values'->>'rate_per_kg')::numeric(14, 2) end,
  coalesce((data->>'delta_basic_salary')::numeric(14, 2), 0),
  coalesce((data->>'delta_allowances')::numeric(14, 2), 0),
  coalesce((data->>'delta_deductions')::numeric(14, 2), 0),
  coalesce((data->>'delta_gross')::numeric(14, 2), 0),
  (data->>'net_amount')::numeric(14, 2),
  data->>'reason',
  data->>'status',
  nullif(data->>'paid_at', '')::timestamptz,
  coalesce((data->>'paid_with_original')::boolean, false),
  coalesce(nullif(data->>'created_by', ''), 'Admin Arboria'),
  created_at
from public.payroll_journals
where record_type = 'correction';

insert into public.journals (
  id, journal_number, journal_date, journal_type, transaction_kind,
  transaction_id, correction_id, reverses_journal_id, reason, description,
  created_by, created_at
)
select
  source.id,
  source.data->>'journal_number',
  (source.data->>'journal_date')::date,
  case when source.data->>'journal_type' in ('salary', 'harvest')
    then 'recognition' else source.data->>'journal_type' end,
  source.data->>'transaction_kind',
  coalesce(correction.original_transaction_id,
    nullif(source.data->>'transaction_id', '')::uuid),
  correction.id,
  source.related_journal_id,
  source.data->>'cancellation_reason',
  source.data->>'description',
  coalesce(nullif(source.data->>'created_by', ''), 'Admin Arboria'),
  source.created_at
from public.payroll_journals as source
left join public.payroll_corrections as correction
  on correction.id = nullif(source.data->>'transaction_id', '')::uuid
  and source.data->>'journal_type' in ('correction', 'payment')
where source.record_type = 'journal';

insert into public.journal_lines (id, journal_id, line_order, account_code, debit, credit)
select
  id,
  journal_id,
  (data->>'line_order')::integer,
  account_code,
  (data->>'debit')::numeric(14, 2),
  (data->>'credit')::numeric(14, 2)
from public.payroll_journals
where record_type = 'journal_line';

set constraints all immediate;

do $$
begin
  if (select count(*) from public.payroll_journals where record_type = 'journal')
       <> (select count(*) from public.journals)
    or (select count(*) from public.payroll_journals where record_type = 'journal_line')
       <> (select count(*) from public.journal_lines)
    or (select count(*) from public.payroll_journals where record_type = 'correction')
       <> (select count(*) from public.payroll_corrections) then
    raise exception 'Journal migration row counts do not match the legacy source.';
  end if;

  if exists (
    select source_row.id
    from public.payroll_journals as source_row
    left join public.journals as normalized_row on normalized_row.id = source_row.id
    where source_row.record_type = 'journal' and normalized_row.id is null
    union all
    select normalized_row.id
    from public.journals as normalized_row
    left join public.payroll_journals as source_row
      on source_row.id = normalized_row.id and source_row.record_type = 'journal'
    where source_row.id is null
  ) or exists (
    select source_row.id
    from public.payroll_journals as source_row
    left join public.journal_lines as normalized_row on normalized_row.id = source_row.id
    where source_row.record_type = 'journal_line' and normalized_row.id is null
    union all
    select normalized_row.id
    from public.journal_lines as normalized_row
    left join public.payroll_journals as source_row
      on source_row.id = normalized_row.id and source_row.record_type = 'journal_line'
    where source_row.id is null
  ) or exists (
    select source_row.id
    from public.payroll_journals as source_row
    left join public.payroll_corrections as normalized_row on normalized_row.id = source_row.id
    where source_row.record_type = 'correction' and normalized_row.id is null
    union all
    select normalized_row.id
    from public.payroll_corrections as normalized_row
    left join public.payroll_journals as source_row
      on source_row.id = normalized_row.id and source_row.record_type = 'correction'
    where source_row.id is null
  ) then
    raise exception 'Journal migration did not preserve all source IDs.';
  end if;

  if exists (
    select 1
    from public.payroll_journals as source_row
    left join public.journal_lines as normalized_row on normalized_row.id = source_row.id
    where source_row.record_type = 'journal_line'
      and (
        normalized_row.id is null
        or normalized_row.journal_id is distinct from source_row.journal_id
        or normalized_row.account_code is distinct from source_row.account_code
        or normalized_row.line_order is distinct from (source_row.data->>'line_order')::integer
        or normalized_row.debit is distinct from (source_row.data->>'debit')::numeric(14, 2)
        or normalized_row.credit is distinct from (source_row.data->>'credit')::numeric(14, 2)
      )
  ) then
    raise exception 'Journal migration changed a journal line, its order, or its relationships.';
  end if;

  if exists (
    select 1
    from public.payroll_journals as source_row
    left join public.journals as normalized_row on normalized_row.id = source_row.id
    left join public.payroll_corrections as correction
      on correction.id = nullif(source_row.data->>'transaction_id', '')::uuid
      and source_row.data->>'journal_type' in ('correction', 'payment')
    where source_row.record_type = 'journal'
      and (
        normalized_row.id is null
        or normalized_row.journal_date is distinct from (source_row.data->>'journal_date')::date
        or normalized_row.journal_number is distinct from source_row.data->>'journal_number'
        or normalized_row.journal_type is distinct from case
          when source_row.data->>'journal_type' in ('salary', 'harvest') then 'recognition'
          else source_row.data->>'journal_type'
        end
        or normalized_row.description is distinct from source_row.data->>'description'
        or normalized_row.transaction_kind is distinct from source_row.data->>'transaction_kind'
        or normalized_row.transaction_id is distinct from coalesce(
          correction.original_transaction_id,
          nullif(source_row.data->>'transaction_id', '')::uuid)
        or normalized_row.correction_id is distinct from correction.id
        or normalized_row.reverses_journal_id is distinct from source_row.related_journal_id
        or normalized_row.reason is distinct from source_row.data->>'cancellation_reason'
        or normalized_row.created_by is distinct from
          coalesce(nullif(source_row.data->>'created_by', ''), 'Admin Arboria')
        or normalized_row.created_at is distinct from source_row.created_at
      )
  ) then
    raise exception 'Journal migration changed a journal header or its relationships.';
  end if;

  if exists (
    select 1
    from public.payroll_journals as source_row
    left join public.payroll_corrections as normalized_row on normalized_row.id = source_row.id
    where source_row.record_type = 'correction'
      and (
        normalized_row.id is null
        or normalized_row.transaction_kind is distinct from source_row.data->>'transaction_kind'
        or normalized_row.original_transaction_id is distinct from
          (source_row.data->>'original_transaction_id')::uuid
        or normalized_row.employee_id is distinct from source_row.employee_id
        or normalized_row.period_id is distinct from source_row.data->>'period_id'
        or normalized_row.slip_number is distinct from nullif(source_row.data->>'slip_number', '')
        or normalized_row.correction_date is distinct from
          (source_row.data->>'correction_date')::date
        or normalized_row.target_basic_salary is distinct from
          case when source_row.data->>'transaction_kind' = 'salary'
            then (source_row.data->'correction_values'->>'basic_salary')::numeric(14, 2) end
        or normalized_row.target_allowances is distinct from
          case when source_row.data->>'transaction_kind' = 'salary'
            then (source_row.data->'correction_values'->>'allowances')::numeric(14, 2) end
        or normalized_row.target_deductions is distinct from
          case when source_row.data->>'transaction_kind' = 'salary'
            then (source_row.data->'correction_values'->>'deductions')::numeric(14, 2) end
        or normalized_row.target_weight_kg is distinct from
          case when source_row.data->>'transaction_kind' = 'harvest'
            then (source_row.data->'correction_values'->>'weight_kg')::numeric(12, 2) end
        or normalized_row.target_rate_per_kg is distinct from
          case when source_row.data->>'transaction_kind' = 'harvest'
            then (source_row.data->'correction_values'->>'rate_per_kg')::numeric(14, 2) end
        or normalized_row.delta_basic_salary is distinct from
          coalesce((source_row.data->>'delta_basic_salary')::numeric(14, 2), 0)
        or normalized_row.delta_allowances is distinct from
          coalesce((source_row.data->>'delta_allowances')::numeric(14, 2), 0)
        or normalized_row.delta_deductions is distinct from
          coalesce((source_row.data->>'delta_deductions')::numeric(14, 2), 0)
        or normalized_row.delta_gross is distinct from
          coalesce((source_row.data->>'delta_gross')::numeric(14, 2), 0)
        or normalized_row.net_amount is distinct from (source_row.data->>'net_amount')::numeric(14, 2)
        or normalized_row.reason is distinct from source_row.data->>'reason'
        or normalized_row.status is distinct from source_row.data->>'status'
        or normalized_row.paid_at is distinct from nullif(source_row.data->>'paid_at', '')::timestamptz
        or normalized_row.paid_with_original is distinct from
          coalesce((source_row.data->>'paid_with_original')::boolean, false)
        or normalized_row.created_by is distinct from
          coalesce(nullif(source_row.data->>'created_by', ''), 'Admin Arboria')
        or normalized_row.created_at is distinct from source_row.created_at
      )
  ) then
    raise exception 'Journal migration changed correction data.';
  end if;

  if exists (
    with old_totals as (
      select journal_id,
        sum((data->>'debit')::numeric) as debit,
        sum((data->>'credit')::numeric) as credit
      from public.payroll_journals
      where record_type = 'journal_line'
      group by journal_id
    ),
    new_totals as (
      select journal_id, sum(debit) as debit, sum(credit) as credit
      from public.journal_lines
      group by journal_id
    )
    select 1
    from old_totals old
    full join new_totals normalized using (journal_id)
    where old.debit is distinct from normalized.debit
      or old.credit is distinct from normalized.credit
  ) then
    raise exception 'Journal migration changed debit or credit totals for a journal.';
  end if;

  if exists (
    select journal.id
    from public.journals journal
    left join public.journal_lines line on line.journal_id = journal.id
    group by journal.id
    having count(line.id) = 0
      or coalesce(sum(line.debit), 0) <> coalesce(sum(line.credit), 0)
  ) then
    raise exception 'At least one migrated journal is not balanced.';
  end if;

  if exists (
    with old_totals as (
      select account_code,
        sum((data->>'debit')::numeric) as debit,
        sum((data->>'credit')::numeric) as credit
      from public.payroll_journals
      where record_type = 'journal_line'
      group by account_code
    ),
    new_totals as (
      select account_code, sum(debit) as debit, sum(credit) as credit
      from public.journal_lines
      group by account_code
    )
    select 1
    from old_totals old
    full join new_totals normalized using (account_code)
    where old.debit is distinct from normalized.debit
      or old.credit is distinct from normalized.credit
  ) then
    raise exception 'Journal migration changed totals for an account.';
  end if;
end
$$;

create or replace view private.payroll_journals as
select id, journal_number, journal_date, description,
  case when journal_type = 'recognition' then transaction_kind else journal_type end as journal_type,
  transaction_kind,
  transaction_id,
  reverses_journal_id as reversal_of,
  reason as cancellation_reason, created_by, created_at
from public.journals;

create or replace view private.payroll_journal_lines as
select id, journal_id, account_code, debit, credit, line_order
from public.journal_lines;

create or replace view private.payroll_corrections as
select id, transaction_kind, original_transaction_id, employee_id, period_id,
  correction_date, slip_number,
  case when transaction_kind = 'salary' then
    jsonb_build_object(
      'basic_salary', target_basic_salary,
      'allowances', target_allowances,
      'deductions', target_deductions)
  else
    jsonb_build_object(
      'weight_kg', target_weight_kg,
      'rate_per_kg', target_rate_per_kg)
  end as correction_values,
  delta_basic_salary, delta_allowances, delta_deductions, delta_gross,
  net_amount, reason, status, paid_at, paid_with_original, created_by, created_at
from public.payroll_corrections;

create or replace function public.reject_journal_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Jurnal dan baris jurnal bersifat immutable. Buat jurnal koreksi atau pembalik.';
  return null;
end;
$$;

create trigger journals_immutable
  before update or delete on public.journals
  for each row execute function public.reject_journal_mutation();
create trigger journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function public.reject_journal_mutation();
create trigger journals_no_truncate
  before truncate on public.journals
  for each statement execute function public.reject_journal_mutation();
create trigger journal_lines_no_truncate
  before truncate on public.journal_lines
  for each statement execute function public.reject_journal_mutation();

create or replace function public.validate_journal_transaction_link()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  correction_row public.payroll_corrections%rowtype;
begin
  if new.transaction_id is null or new.transaction_kind is null then
    raise exception 'Setiap jurnal harus terhubung ke transaksi gaji atau upah.';
  end if;
  if new.transaction_kind = 'salary' then
    if not exists (select 1 from public.salary_payments where id = new.transaction_id) then
      raise exception 'Transaksi gaji % tidak ditemukan.', new.transaction_id;
    end if;
  elsif new.transaction_kind = 'harvest' then
    if not exists (select 1 from public.harvest_records where id = new.transaction_id) then
      raise exception 'Transaksi upah % tidak ditemukan.', new.transaction_id;
    end if;
  else
    raise exception 'Jenis transaksi jurnal tidak valid.';
  end if;

  if new.journal_type = 'correction' and new.correction_id is null then
    raise exception 'Jurnal koreksi harus terhubung ke catatan koreksi.';
  end if;
  if new.correction_id is not null then
    select * into correction_row from public.payroll_corrections
    where id = new.correction_id;
    if correction_row.id is null
      or correction_row.transaction_kind <> new.transaction_kind
      or correction_row.original_transaction_id <> new.transaction_id then
      raise exception 'Relasi catatan koreksi dan transaksi asal tidak cocok.';
    end if;
  end if;
  return new;
end;
$$;
create trigger journals_transaction_link_guard
  before insert on public.journals
  for each row execute function public.validate_journal_transaction_link();

alter table public.journals enable row level security;
alter table public.journal_lines enable row level security;
alter table public.payroll_corrections enable row level security;
create policy "Public demo read" on public.journals for select to anon using (true);
create policy "Public demo read" on public.journal_lines for select to anon using (true);
create policy "Public demo read" on public.payroll_corrections for select to anon using (true);
grant select on public.journals, public.journal_lines, public.payroll_corrections to anon;
revoke insert, update, delete, truncate, references, trigger
  on public.journals, public.journal_lines, public.payroll_corrections
  from public, anon, authenticated;

drop view if exists public.payroll_journal_entries;
create or replace view public.journal_view
with (security_invoker = true)
as
select
  journal.id as journal_id,
  journal.journal_date,
  coalesce(journal.journal_number, correction.slip_number,
    salary.slip_number, harvest.slip_number) as journal_number,
  journal.journal_type,
  journal.description,
  journal.transaction_kind,
  journal.transaction_id,
  journal.correction_id,
  journal.reverses_journal_id,
  line.id as journal_line_id,
  line.line_order,
  line.account_code,
  account.name as account_name,
  line.debit,
  line.credit
from public.journals as journal
join public.journal_lines as line on line.journal_id = journal.id
left join public.accounts as account on account.code = line.account_code
left join public.payroll_corrections as correction on correction.id = journal.correction_id
left join public.salary_payments as salary
  on journal.transaction_kind = 'salary' and salary.id = journal.transaction_id
left join public.harvest_records as harvest
  on journal.transaction_kind = 'harvest' and harvest.id = journal.transaction_id
order by journal.journal_date, journal.created_at, journal.id,
  case when line.debit > 0 then 0 else 1 end, line.line_order, line.id;
grant select on public.journal_view to anon;

create or replace function public.write_payroll_compatibility_view()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_kind text;
  row_json jsonb;
  row_data jsonb;
  correction_values jsonb;
  row_id uuid;
  employee_key uuid;
  journal_key uuid;
  account_key text;
  related_journal_key uuid;
  correction_key uuid;
  transaction_key uuid;
  source_transaction_key uuid;
  transaction_kind_value text;
  journal_type_value text;
  stored_journal_type text;
  record_created_at timestamptz;
  stored_row record;
begin
  row_kind := case tg_table_name
    when 'payroll_journals' then 'journal'
    when 'payroll_journal_lines' then 'journal_line'
    when 'payroll_corrections' then 'correction'
    else null
  end;
  if row_kind is null then
    raise exception 'Unsupported payroll compatibility view: %', tg_table_name;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Journal, baris jurnal, dan koreksi historis tidak boleh dihapus.';
  end if;

  row_json := to_jsonb(new);
  row_id := coalesce(nullif(row_json->>'id', '')::uuid, gen_random_uuid());
  record_created_at := coalesce(nullif(row_json->>'created_at', '')::timestamptz, now());

  if row_kind = 'journal' then
    if tg_op <> 'INSERT' then
      raise exception 'Jurnal tidak boleh diubah; buat jurnal baru sebagai koreksi atau pembalik.';
    end if;
    journal_type_value := row_json->>'journal_type';
    stored_journal_type := case
      when journal_type_value in ('salary', 'harvest') then 'recognition'
      else journal_type_value
    end;
    transaction_kind_value := row_json->>'transaction_kind';
    transaction_key := nullif(row_json->>'transaction_id', '')::uuid;
    source_transaction_key := transaction_key;
    correction_key := null;
    related_journal_key := nullif(row_json->>'reversal_of', '')::uuid;

    if journal_type_value in ('correction', 'payment') then
      select correction.id, correction.original_transaction_id
        into correction_key, source_transaction_key
      from public.payroll_corrections as correction
      where correction.id = transaction_key;
      if not found then
        correction_key := null;
        source_transaction_key := transaction_key;
      end if;
    end if;
    if related_journal_key is not null then
      select journal.correction_id into correction_key
      from public.journals as journal
      where journal.id = related_journal_key;
    end if;
    if journal_type_value = 'correction' and correction_key is null then
      raise exception 'Jurnal koreksi harus merujuk ke catatan koreksi yang ada.';
    end if;

    row_data := row_json - array['id', 'transaction_id', 'reversal_of', 'created_at'];
    insert into public.journals (
      id, journal_number, journal_date, journal_type, transaction_kind,
      transaction_id, correction_id, reverses_journal_id, reason,
      description, created_by, created_at
    )
    values (
      row_id,
      nullif(row_json->>'journal_number', ''),
      (row_json->>'journal_date')::date,
      stored_journal_type,
      transaction_kind_value,
      source_transaction_key,
      correction_key,
      related_journal_key,
      nullif(row_json->>'cancellation_reason', ''),
      row_json->>'description',
      coalesce(nullif(row_json->>'created_by', ''), 'Admin Arboria'),
      record_created_at
    );
  elsif row_kind = 'journal_line' then
    if tg_op <> 'INSERT' then
      raise exception 'Baris jurnal tidak boleh diubah; buat jurnal pembalik.';
    end if;
    journal_key := nullif(row_json->>'journal_id', '')::uuid;
    account_key := row_json->>'account_code';
    insert into public.journal_lines (id, journal_id, line_order, account_code, debit, credit)
    values (
      row_id, journal_key,
      coalesce(nullif(row_json->>'line_order', '')::integer, 0),
      account_key,
      coalesce(nullif(row_json->>'debit', '')::numeric(14, 2), 0),
      coalesce(nullif(row_json->>'credit', '')::numeric(14, 2), 0)
    );
  elsif tg_op = 'INSERT' then
    row_data := row_json;
    correction_values := row_data->'correction_values';
    insert into public.payroll_corrections (
      id, transaction_kind, original_transaction_id, employee_id, period_id,
      correction_date, slip_number, target_basic_salary, target_allowances,
      target_deductions, target_weight_kg, target_rate_per_kg,
      delta_basic_salary, delta_allowances, delta_deductions, delta_gross,
      net_amount, reason, status, paid_at, paid_with_original, created_by, created_at
    )
    values (
      row_id,
      row_data->>'transaction_kind',
      nullif(row_data->>'original_transaction_id', '')::uuid,
      nullif(row_data->>'employee_id', '')::uuid,
      row_data->>'period_id',
      coalesce(nullif(row_data->>'correction_date', '')::date, current_date),
      nullif(row_data->>'slip_number', ''),
      nullif(correction_values->>'basic_salary', '')::numeric(14, 2),
      nullif(correction_values->>'allowances', '')::numeric(14, 2),
      nullif(correction_values->>'deductions', '')::numeric(14, 2),
      nullif(correction_values->>'weight_kg', '')::numeric(12, 2),
      nullif(correction_values->>'rate_per_kg', '')::numeric(14, 2),
      coalesce(nullif(row_data->>'delta_basic_salary', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_allowances', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_deductions', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_gross', '')::numeric(14, 2), 0),
      (row_data->>'net_amount')::numeric(14, 2),
      row_data->>'reason',
      row_data->>'status',
      nullif(row_data->>'paid_at', '')::timestamptz,
      coalesce(nullif(row_data->>'paid_with_original', '')::boolean, false),
      coalesce(nullif(row_data->>'created_by', ''), 'Admin Arboria'),
      record_created_at
    );
  else
    update public.payroll_corrections
    set slip_number = nullif(row_json->>'slip_number', ''),
        status = row_json->>'status',
        paid_at = nullif(row_json->>'paid_at', '')::timestamptz,
        paid_with_original = coalesce(nullif(row_json->>'paid_with_original', '')::boolean, false)
    where id = old.id
    returning * into stored_row;
    if not found then
      raise exception 'Catatan koreksi % tidak ditemukan.', old.id;
    end if;
  end if;

  execute format('select * from %I.%I where id = $1', tg_table_schema, tg_table_name)
    into new using row_id;
  return new;
end;
$$;

create or replace function public.create_payroll_journal(
  journal_day date,
  journal_description text,
  journal_kind text,
  transaction_type text,
  transaction_key uuid,
  lines jsonb,
  reversal_key uuid default null,
  reason text default null,
  evidence_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  new_journal_id uuid;
  journal_number_value text := evidence_number;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
  correction_key uuid;
  source_transaction_key uuid := transaction_key;
  stored_journal_type text;
begin
  select coalesce(sum((line->>'debit')::numeric), 0),
         coalesce(sum((line->>'credit')::numeric), 0)
    into debit_total, credit_total
    from jsonb_array_elements(lines) as entries(line);
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Jurnal tidak seimbang: total debit % dan kredit %.', debit_total, credit_total;
  end if;

  if journal_kind in ('correction', 'payment') then
    select correction.id, correction.original_transaction_id
      into correction_key, source_transaction_key
    from public.payroll_corrections as correction
    where correction.id = transaction_key;
    if not found then
      correction_key := null;
      source_transaction_key := transaction_key;
    end if;
  end if;
  if correction_key is null and reversal_key is not null then
    select journal.correction_id into correction_key
    from public.journals as journal
    where journal.id = reversal_key;
  end if;

  if journal_number_value is null and correction_key is not null then
    select slip_number into journal_number_value
    from public.payroll_corrections where id = correction_key;
  end if;
  if journal_number_value is null then
    if transaction_type = 'salary' then
      select slip_number into journal_number_value
      from public.salary_payments where id = source_transaction_key;
    elsif transaction_type = 'harvest' then
      select slip_number into journal_number_value
      from public.harvest_records where id = source_transaction_key;
    end if;
  end if;
  if journal_kind = 'payment' and nullif(journal_number_value, '') is null then
    raise exception 'Nomor slip wajib tersedia untuk jurnal pembayaran.';
  end if;
  stored_journal_type := case
    when journal_kind in ('salary', 'harvest') then 'recognition'
    else journal_kind
  end;

  insert into private.payroll_journals
    (journal_number, journal_date, description, journal_type, transaction_kind,
     transaction_id, reversal_of, cancellation_reason)
  values
    (journal_number_value, journal_day, journal_description, stored_journal_type,
     transaction_type, transaction_key, reversal_key, reason)
  returning id into new_journal_id;

  insert into private.payroll_journal_lines
    (journal_id, account_code, debit, credit, line_order)
  select new_journal_id, line->>'account_code',
         coalesce((line->>'debit')::numeric, 0),
         coalesce((line->>'credit')::numeric, 0),
         ordinality::integer
    from jsonb_array_elements(lines) with ordinality as entries(line, ordinality)
    where coalesce((line->>'debit')::numeric, 0) > 0
       or coalesce((line->>'credit')::numeric, 0) > 0;
  return new_journal_id;
end;
$$;

create or replace function public.on_payroll_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  is_salary boolean := tg_table_name = 'salary_payments';
  liability_account text := case when tg_table_name = 'salary_payments' then '2-101' else '2-102' end;
  journal_kind text := case when tg_table_name = 'salary_payments' then 'salary' else 'harvest' end;
  payable_amount numeric(14, 2) := new.total_amount;
  correction_total numeric(14, 2) := 0;
  journal_day date;
  base_description text;
  correction_row record;
begin
  if new.status = 'paid' and old.status = 'pending' then
    select coalesce(sum(net_amount), 0) into correction_total
      from public.payroll_corrections
      where transaction_kind = journal_kind
        and original_transaction_id = new.id
        and status = 'pending';
    payable_amount := new.total_amount + correction_total;
    if payable_amount < 0 then
      raise exception 'Koreksi menghasilkan jumlah pembayaran negatif. Batalkan atau periksa koreksi terlebih dahulu.';
    end if;
    select full_name into base_description from public.employees where id = new.employee_id;
    base_description := case when is_salary then 'Gaji ' else 'Upah panen ' end || base_description
      || ' - ' || (ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[substring(new.period_id, 6, 2)::integer]
      || ' ' || substring(new.period_id, 1, 4);
    journal_day := coalesce(new.paid_at::date, current_date);
    if payable_amount > 0 then
      perform public.create_payroll_journal(journal_day, 'Pembayaran ' || base_description,
        'payment', journal_kind, new.id, jsonb_build_array(
          jsonb_build_object('account_code', liability_account, 'debit', payable_amount, 'credit', 0),
          jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', payable_amount)
        ), null, null, new.slip_number);
    end if;
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
      values (journal_kind, new.id, 'dibayar', new.slip_number);
    for correction_row in
      update public.payroll_corrections
        set status = 'paid', paid_at = journal_day::timestamptz, paid_with_original = true
        where transaction_kind = journal_kind and original_transaction_id = new.id and status = 'pending'
        returning id
    loop
      update public.payroll_audit_trail
        set slip_number = new.slip_number
        where transaction_id = correction_row.id;
      insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number, occurred_at)
        values (journal_kind, correction_row.id, 'dibayar', new.slip_number, journal_day::timestamptz);
    end loop;
  elsif new.status = 'cancelled' then
    insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
      values (journal_kind, new.id, 'dibatalkan', coalesce(new.cancelled_by, 'Admin Arboria'), new.cancellation_reason, new.slip_number);
  end if;
  return new;
end;
$$;

create or replace function public.cancel_payroll_transaction(
  transaction_type text,
  transaction_key uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row record;
  original_journal_ids uuid[];
  reversal_lines jsonb;
  reversal_journal_id uuid;
  first_reversal_journal_id uuid;
  source_journal record;
  transaction_table text;
  reversal_description text;
  reversal_kind_label text;
  reason_value text;
begin
  if transaction_type not in ('salary', 'harvest') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if nullif(trim(reason), '') is null then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  reason_value := trim(reason);
  transaction_table := case when transaction_type = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select t.*, e.full_name from public.%I t join public.employees e on e.id = t.employee_id where t.id = $1 for update of t', transaction_table)
    into transaction_row using transaction_key;
  if transaction_row.id is null then raise exception 'Transaksi tidak ditemukan.'; end if;
  if transaction_row.status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan.'; end if;

  select array_agg(journal.id order by journal.journal_date, journal.created_at, journal.id)
    into original_journal_ids
    from public.journals as journal
    where journal.journal_type <> 'reversal'
      and journal.transaction_kind = transaction_type
      and journal.transaction_id = transaction_key;
  if coalesce(array_length(original_journal_ids, 1), 0) = 0 then raise exception 'Jurnal transaksi tidak ditemukan.'; end if;

  for source_journal in
    select journal.id, journal.journal_type, journal.journal_number, journal.created_at
    from public.journals as journal
    where journal.id = any(original_journal_ids)
    order by case
      when journal.journal_type = 'recognition' then 0
      when journal.journal_type = 'payment' then 1
      when journal.journal_type = 'correction' then 2
      else 3
    end, journal.created_at, journal.id
  loop
    select jsonb_agg(jsonb_build_object(
        'account_code', line.account_code,
        'debit', line.credit,
        'credit', line.debit
      ) order by case when line.credit > 0 then 0 else 1 end, line.line_order, line.id)
      into reversal_lines
      from public.journal_lines as line
      where line.journal_id = source_journal.id;
    if reversal_lines is null then
      raise exception 'Baris jurnal pembalik untuk jurnal % tidak ditemukan.', source_journal.id;
    end if;
    reversal_kind_label := case
      when source_journal.journal_type = 'recognition' then 'Pengakuan'
      when source_journal.journal_type = 'payment' then 'Pembayaran'
      when source_journal.journal_type = 'correction' then 'Koreksi'
      else 'Jurnal'
    end;
    reversal_description := 'Pembalik ' || reversal_kind_label || ' '
      || coalesce(source_journal.journal_number, transaction_row.slip_number,
        transaction_row.full_name || ' - ' || transaction_row.period_id)
      || ': ' || reason_value;
    reversal_journal_id := public.create_payroll_journal(current_date,
      reversal_description, 'reversal', transaction_type, transaction_key,
      reversal_lines, source_journal.id, reason_value,
      coalesce(source_journal.journal_number, transaction_row.slip_number));
    if first_reversal_journal_id is null then
      first_reversal_journal_id := reversal_journal_id;
    end if;
  end loop;
  if first_reversal_journal_id is null then raise exception 'Jurnal pembalik tidak berhasil dibuat.'; end if;

  perform set_config('arboria.allow_cancel', 'true', true);
  execute format('update public.%I set status = ''cancelled'', cancellation_reason = $2, cancelled_by = $3 where id = $1', transaction_table)
    using transaction_key, reason_value, 'Admin Arboria';
  update public.payroll_corrections
    set status = 'cancelled'
    where transaction_kind = transaction_type and original_transaction_id = transaction_key
      and status <> 'cancelled';
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
    select correction.transaction_kind, correction.id, 'dibatalkan', 'Admin Arboria', reason_value, correction.slip_number
    from public.payroll_corrections as correction
    where correction.transaction_kind = transaction_type
      and correction.original_transaction_id = transaction_key;
  return first_reversal_journal_id;
end;
$$;

create or replace function public.payroll_correction_payment(correction_key uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  correction_row public.payroll_corrections%rowtype;
  source_status text;
  transaction_table text;
  liability_account text;
  correction_slip text;
  journal_date_value date := current_date;
begin
  select * into correction_row from public.payroll_corrections
    where id = correction_key for update;
  if correction_row.id is null then raise exception 'Transaksi koreksi tidak ditemukan.'; end if;
  if correction_row.status <> 'pending' or correction_row.net_amount <= 0 then
    raise exception 'Koreksi ini tidak memiliki utang yang menunggu pembayaran.';
  end if;
  transaction_table := case when correction_row.transaction_kind = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select status from public.%I where id = $1', transaction_table)
    into source_status using correction_row.original_transaction_id;
  if source_status is null then raise exception 'Transaksi asli tidak ditemukan.'; end if;
  if source_status = 'cancelled' then raise exception 'Transaksi asli sudah dibatalkan.'; end if;
  if source_status <> 'paid' then raise exception 'Bayarkan transaksi asli terlebih dahulu; nilai koreksi akan dibayar bersama.'; end if;
  liability_account := case when correction_row.transaction_kind = 'salary' then '2-101' else '2-102' end;
  correction_slip := public.next_payroll_slip_number(correction_row.transaction_kind, journal_date_value);
  perform public.create_payroll_journal(journal_date_value,
    'Pembayaran koreksi ' || correction_slip, 'payment',
    correction_row.transaction_kind, correction_row.id,
    jsonb_build_array(
      jsonb_build_object('account_code', liability_account, 'debit', correction_row.net_amount, 'credit', 0),
      jsonb_build_object('account_code', '1-101', 'debit', 0, 'credit', correction_row.net_amount)
    ), null, null, correction_slip);
  update public.payroll_corrections
    set status = 'paid', paid_at = now(), slip_number = correction_slip
    where id = correction_key;
  update public.payroll_audit_trail
    set slip_number = correction_slip
    where transaction_id = correction_key;
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, slip_number)
    values (correction_row.transaction_kind, correction_row.id, 'dibayar', correction_slip);
  return correction_key;
end;
$$;

revoke all on function public.reject_journal_mutation() from public, anon, authenticated;
revoke all on function public.validate_journal_transaction_link() from public, anon, authenticated;
revoke all on function public.write_payroll_compatibility_view() from public, anon, authenticated;
revoke all on function public.create_payroll_journal(date, text, text, text, uuid, jsonb, uuid, text, text) from public, anon, authenticated;
revoke all on function public.cancel_payroll_transaction(text, uuid, text) from public, anon, authenticated;
revoke all on function public.payroll_correction_payment(uuid) from public, anon, authenticated;
grant execute on function public.cancel_payroll_transaction(text, uuid, text) to anon;
grant execute on function public.correct_payroll_transaction(text, uuid, jsonb, text) to anon;
grant execute on function public.payroll_correction_payment(uuid) to anon;

notify pgrst, 'reload schema';
commit;

select 'journals' as record_type,
  (select count(*) from public.payroll_journals where record_type = 'journal') as legacy_rows,
  (select count(*) from public.journals) as normalized_rows
union all
select 'journal_line',
  (select count(*) from public.payroll_journals where record_type = 'journal_line'),
  (select count(*) from public.journal_lines)
union all
select 'correction',
  (select count(*) from public.payroll_journals where record_type = 'correction'),
  (select count(*) from public.payroll_corrections);

select
  coalesce(sum((legacy.data->>'debit')::numeric), 0) as legacy_debit,
  coalesce(sum((legacy.data->>'credit')::numeric), 0) as legacy_credit,
  (select coalesce(sum(debit), 0) from public.journal_lines) as normalized_debit,
  (select coalesce(sum(credit), 0) from public.journal_lines) as normalized_credit,
  coalesce(sum((legacy.data->>'debit')::numeric), 0)
    = (select coalesce(sum(debit), 0) from public.journal_lines) as debit_matches,
  coalesce(sum((legacy.data->>'credit')::numeric), 0)
    = (select coalesce(sum(credit), 0) from public.journal_lines) as credit_matches
from public.payroll_journals as legacy
where legacy.record_type = 'journal_line';

with legacy_totals as (
  select account_code,
    sum((data->>'debit')::numeric) as debit,
    sum((data->>'credit')::numeric) as credit
  from public.payroll_journals
  where record_type = 'journal_line'
  group by account_code
),
normalized_totals as (
  select account_code, sum(debit) as debit, sum(credit) as credit
  from public.journal_lines
  group by account_code
)
select account.code, account.name,
  coalesce(legacy_totals.debit, 0) as legacy_debit,
  coalesce(normalized_totals.debit, 0) as normalized_debit,
  coalesce(legacy_totals.credit, 0) as legacy_credit,
  coalesce(normalized_totals.credit, 0) as normalized_credit,
  case when account.normal_balance = 'credit'
    then coalesce(legacy_totals.credit, 0) - coalesce(legacy_totals.debit, 0)
    else coalesce(legacy_totals.debit, 0) - coalesce(legacy_totals.credit, 0)
  end as legacy_balance,
  case when account.normal_balance = 'credit'
    then coalesce(normalized_totals.credit, 0) - coalesce(normalized_totals.debit, 0)
    else coalesce(normalized_totals.debit, 0) - coalesce(normalized_totals.credit, 0)
  end as normalized_balance,
  coalesce(legacy_totals.debit, 0) = coalesce(normalized_totals.debit, 0)
    and coalesce(legacy_totals.credit, 0) = coalesce(normalized_totals.credit, 0) as balance_matches
from public.accounts as account
left join legacy_totals on legacy_totals.account_code = account.code
left join normalized_totals on normalized_totals.account_code = account.code
order by account.code;

with legacy_totals as (
  select journal_id,
    sum((data->>'debit')::numeric) as debit,
    sum((data->>'credit')::numeric) as credit
  from public.payroll_journals
  where record_type = 'journal_line'
  group by journal_id
),
normalized_totals as (
  select journal_id, sum(debit) as debit, sum(credit) as credit
  from public.journal_lines
  group by journal_id
)
select journal.id as journal_id, journal.journal_date, journal.journal_type,
  journal.description,
  legacy_totals.debit as legacy_debit,
  normalized_totals.debit as normalized_debit,
  legacy_totals.credit as legacy_credit,
  normalized_totals.credit as normalized_credit,
  legacy_totals.debit = normalized_totals.debit
    and legacy_totals.credit = normalized_totals.credit as totals_match
from public.journals as journal
left join legacy_totals on legacy_totals.journal_id = journal.id
left join normalized_totals on normalized_totals.journal_id = journal.id
order by journal.journal_date, journal.created_at, journal.id;

-- ========= END NORMALIZATION MIGRATION BLOCK =========

-- ============== PRE-MIGRATION JOURNAL BASELINE ==============
-- Run this read-only query separately before the line-order migration.
with account_totals as (
  select account.code as account_code, account.name as account_name,
    account.normal_balance,
    coalesce(sum(line.debit), 0) as total_debit,
    coalesce(sum(line.credit), 0) as total_credit
  from public.accounts as account
  left join public.journal_lines as line on line.account_code = account.code
  group by account.code, account.name, account.normal_balance
),
journal_totals as (
  select journal_id, sum(debit) as total_debit, sum(credit) as total_credit
  from public.journal_lines
  group by journal_id
)
select jsonb_build_object(
  'line_count', (select count(*) from public.journal_lines),
  'total_debit', (select coalesce(sum(debit), 0) from public.journal_lines),
  'total_credit', (select coalesce(sum(credit), 0) from public.journal_lines),
  'overall_balanced',
    (select coalesce(sum(debit), 0) = coalesce(sum(credit), 0) from public.journal_lines),
  'accounts', coalesce((
    select jsonb_agg(jsonb_build_object(
      'account_code', account_code,
      'account_name', account_name,
      'normal_balance', normal_balance,
      'total_debit', total_debit,
      'total_credit', total_credit,
      'balance', case when normal_balance = 'credit'
        then total_credit - total_debit else total_debit - total_credit end
    ) order by account_code)
    from account_totals
  ), '[]'::jsonb),
  'journals', coalesce((
    select jsonb_agg(jsonb_build_object(
      'journal_id', journal_id,
      'total_debit', total_debit,
      'total_credit', total_credit,
      'balanced', total_debit = total_credit
    ) order by journal_id)
    from journal_totals
  ), '[]'::jsonb)
) as line_order_baseline;

-- ================= JOURNAL LINE ORDER MIGRATION =================
-- Existing normalized project: run this block alone after recording the
-- baseline query results. It is also applied at the end of a fresh install.
begin;

lock table public.journals, public.journal_lines in share row exclusive mode;

do $$
begin
  if to_regclass('public.journals') is null
    or to_regclass('public.journal_lines') is null
    or to_regclass('private.payroll_journal_lines') is null then
    raise exception 'Normalized journal tables and compatibility view must exist before this migration.';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_lines'
      and column_name = 'line_order'
  ) then
    raise exception 'public.journal_lines.line_order is already absent; inspect the schema before retrying.';
  end if;
end
$$;

-- (a) Recreate the read views without line_order.
drop view public.journal_view;
create view public.journal_view
with (security_invoker = true)
as
select
  journal.id as journal_id,
  journal.journal_date,
  journal.journal_type,
  journal.description,
  journal.transaction_id,
  line.account_code,
  account.name as account_name,
  line.debit,
  line.credit
from public.journals as journal
join public.journal_lines as line on line.journal_id = journal.id
left join public.accounts as account on account.code = line.account_code
order by
  journal.journal_date asc,
  journal.created_at asc,
  journal.id asc,
  case when line.debit > 0 then 0 else 1 end asc,
  line.account_code asc,
  line.id asc;
grant select on public.journal_view to anon;

drop trigger if exists payroll_journal_lines_write on private.payroll_journal_lines;
drop view private.payroll_journal_lines;
create view private.payroll_journal_lines as
select id, journal_id, account_code, debit, credit
from public.journal_lines;
revoke all on private.payroll_journal_lines from public, anon, authenticated;

-- (b) Recreate the compatibility writer, journal creator and reversal path.
create or replace function public.write_payroll_compatibility_view()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  row_kind text;
  row_json jsonb;
  row_data jsonb;
  correction_values jsonb;
  row_id uuid;
  employee_key uuid;
  journal_key uuid;
  account_key text;
  related_journal_key uuid;
  correction_key uuid;
  transaction_key uuid;
  source_transaction_key uuid;
  transaction_kind_value text;
  journal_type_value text;
  stored_journal_type text;
  record_created_at timestamptz;
  stored_row record;
begin
  row_kind := case tg_table_name
    when 'payroll_journals' then 'journal'
    when 'payroll_journal_lines' then 'journal_line'
    when 'payroll_corrections' then 'correction'
    else null
  end;
  if row_kind is null then
    raise exception 'Unsupported payroll compatibility view: %', tg_table_name;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Journal, baris jurnal, dan koreksi historis tidak boleh dihapus.';
  end if;

  row_json := to_jsonb(new);
  row_id := coalesce(nullif(row_json->>'id', '')::uuid, gen_random_uuid());
  record_created_at := coalesce(nullif(row_json->>'created_at', '')::timestamptz, now());

  if row_kind = 'journal' then
    if tg_op <> 'INSERT' then
      raise exception 'Jurnal tidak boleh diubah; buat jurnal baru sebagai koreksi atau pembalik.';
    end if;
    journal_type_value := row_json->>'journal_type';
    stored_journal_type := case
      when journal_type_value in ('salary', 'harvest') then 'recognition'
      else journal_type_value
    end;
    transaction_kind_value := row_json->>'transaction_kind';
    transaction_key := nullif(row_json->>'transaction_id', '')::uuid;
    source_transaction_key := transaction_key;
    correction_key := null;
    related_journal_key := nullif(row_json->>'reversal_of', '')::uuid;

    if journal_type_value in ('correction', 'payment') then
      select correction.id, correction.original_transaction_id
        into correction_key, source_transaction_key
      from public.payroll_corrections as correction
      where correction.id = transaction_key;
      if not found then
        correction_key := null;
        source_transaction_key := transaction_key;
      end if;
    end if;
    if related_journal_key is not null then
      select journal.correction_id into correction_key
      from public.journals as journal
      where journal.id = related_journal_key;
    end if;
    if journal_type_value = 'correction' and correction_key is null then
      raise exception 'Jurnal koreksi harus merujuk ke catatan koreksi yang ada.';
    end if;

    insert into public.journals (
      id, journal_number, journal_date, journal_type, transaction_kind,
      transaction_id, correction_id, reverses_journal_id, reason,
      description, created_by, created_at
    )
    values (
      row_id,
      nullif(row_json->>'journal_number', ''),
      (row_json->>'journal_date')::date,
      stored_journal_type,
      transaction_kind_value,
      source_transaction_key,
      correction_key,
      related_journal_key,
      nullif(row_json->>'cancellation_reason', ''),
      row_json->>'description',
      coalesce(nullif(row_json->>'created_by', ''), 'Admin Arboria'),
      record_created_at
    );
  elsif row_kind = 'journal_line' then
    if tg_op <> 'INSERT' then
      raise exception 'Baris jurnal tidak boleh diubah; buat jurnal pembalik.';
    end if;
    journal_key := nullif(row_json->>'journal_id', '')::uuid;
    account_key := row_json->>'account_code';
    insert into public.journal_lines (id, journal_id, account_code, debit, credit)
    values (
      row_id,
      journal_key,
      account_key,
      coalesce(nullif(row_json->>'debit', '')::numeric(14, 2), 0),
      coalesce(nullif(row_json->>'credit', '')::numeric(14, 2), 0)
    );
  elsif tg_op = 'INSERT' then
    row_data := row_json;
    correction_values := row_data->'correction_values';
    insert into public.payroll_corrections (
      id, transaction_kind, original_transaction_id, employee_id, period_id,
      correction_date, slip_number, target_basic_salary, target_allowances,
      target_deductions, target_weight_kg, target_rate_per_kg,
      delta_basic_salary, delta_allowances, delta_deductions, delta_gross,
      net_amount, reason, status, paid_at, paid_with_original, created_by, created_at
    )
    values (
      row_id,
      row_data->>'transaction_kind',
      nullif(row_data->>'original_transaction_id', '')::uuid,
      nullif(row_data->>'employee_id', '')::uuid,
      row_data->>'period_id',
      coalesce(nullif(row_data->>'correction_date', '')::date, current_date),
      nullif(row_data->>'slip_number', ''),
      nullif(correction_values->>'basic_salary', '')::numeric(14, 2),
      nullif(correction_values->>'allowances', '')::numeric(14, 2),
      nullif(correction_values->>'deductions', '')::numeric(14, 2),
      nullif(correction_values->>'weight_kg', '')::numeric(12, 2),
      nullif(correction_values->>'rate_per_kg', '')::numeric(14, 2),
      coalesce(nullif(row_data->>'delta_basic_salary', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_allowances', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_deductions', '')::numeric(14, 2), 0),
      coalesce(nullif(row_data->>'delta_gross', '')::numeric(14, 2), 0),
      (row_data->>'net_amount')::numeric(14, 2),
      row_data->>'reason',
      row_data->>'status',
      nullif(row_data->>'paid_at', '')::timestamptz,
      coalesce(nullif(row_data->>'paid_with_original', '')::boolean, false),
      coalesce(nullif(row_data->>'created_by', ''), 'Admin Arboria'),
      record_created_at
    );
  else
    update public.payroll_corrections
    set slip_number = nullif(row_json->>'slip_number', ''),
        status = row_json->>'status',
        paid_at = nullif(row_json->>'paid_at', '')::timestamptz,
        paid_with_original = coalesce(nullif(row_json->>'paid_with_original', '')::boolean, false)
    where id = old.id
    returning * into stored_row;
    if not found then
      raise exception 'Catatan koreksi % tidak ditemukan.', old.id;
    end if;
  end if;

  execute format('select * from %I.%I where id = $1', tg_table_schema, tg_table_name)
    into new using row_id;
  return new;
end;
$$;

create trigger payroll_journal_lines_write
  instead of insert or update or delete on private.payroll_journal_lines
  for each row execute function public.write_payroll_compatibility_view();

create or replace function public.create_payroll_journal(
  journal_day date,
  journal_description text,
  journal_kind text,
  transaction_type text,
  transaction_key uuid,
  lines jsonb,
  reversal_key uuid default null,
  reason text default null,
  evidence_number text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  new_journal_id uuid;
  journal_number_value text := evidence_number;
  debit_total numeric(14, 2);
  credit_total numeric(14, 2);
  correction_key uuid;
  source_transaction_key uuid := transaction_key;
  stored_journal_type text;
begin
  select coalesce(sum((line->>'debit')::numeric), 0),
         coalesce(sum((line->>'credit')::numeric), 0)
    into debit_total, credit_total
    from jsonb_array_elements(lines) as entries(line);
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Jurnal tidak seimbang: total debit % dan kredit %.', debit_total, credit_total;
  end if;

  if journal_kind in ('correction', 'payment') then
    select correction.id, correction.original_transaction_id
      into correction_key, source_transaction_key
    from public.payroll_corrections as correction
    where correction.id = transaction_key;
    if not found then
      correction_key := null;
      source_transaction_key := transaction_key;
    end if;
  end if;
  if correction_key is null and reversal_key is not null then
    select journal.correction_id into correction_key
    from public.journals as journal
    where journal.id = reversal_key;
  end if;

  if journal_number_value is null and correction_key is not null then
    select slip_number into journal_number_value
    from public.payroll_corrections where id = correction_key;
  end if;
  if journal_number_value is null then
    if transaction_type = 'salary' then
      select slip_number into journal_number_value
      from public.salary_payments where id = source_transaction_key;
    elsif transaction_type = 'harvest' then
      select slip_number into journal_number_value
      from public.harvest_records where id = source_transaction_key;
    end if;
  end if;
  if journal_kind = 'payment' and nullif(journal_number_value, '') is null then
    raise exception 'Nomor slip wajib tersedia untuk jurnal pembayaran.';
  end if;
  stored_journal_type := case
    when journal_kind in ('salary', 'harvest') then 'recognition'
    else journal_kind
  end;

  insert into private.payroll_journals
    (journal_number, journal_date, description, journal_type, transaction_kind,
     transaction_id, reversal_of, cancellation_reason)
  values
    (journal_number_value, journal_day, journal_description, stored_journal_type,
     transaction_type, transaction_key, reversal_key, reason)
  returning id into new_journal_id;

  insert into private.payroll_journal_lines
    (journal_id, account_code, debit, credit)
  select new_journal_id, line->>'account_code',
         coalesce((line->>'debit')::numeric, 0),
         coalesce((line->>'credit')::numeric, 0)
    from jsonb_array_elements(lines) as entries(line)
    where coalesce((line->>'debit')::numeric, 0) > 0
       or coalesce((line->>'credit')::numeric, 0) > 0;
  return new_journal_id;
end;
$$;

create or replace function public.cancel_payroll_transaction(
  transaction_type text,
  transaction_key uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_row record;
  original_journal_ids uuid[];
  reversal_lines jsonb;
  reversal_journal_id uuid;
  first_reversal_journal_id uuid;
  source_journal record;
  transaction_table text;
  reversal_description text;
  reversal_kind_label text;
  reason_value text;
begin
  if transaction_type not in ('salary', 'harvest') then raise exception 'Jenis transaksi tidak valid.'; end if;
  if nullif(trim(reason), '') is null then raise exception 'Alasan pembatalan wajib diisi.'; end if;
  reason_value := trim(reason);
  transaction_table := case when transaction_type = 'salary' then 'salary_payments' else 'harvest_records' end;
  execute format('select t.*, e.full_name from public.%I t join public.employees e on e.id = t.employee_id where t.id = $1 for update of t', transaction_table)
    into transaction_row using transaction_key;
  if transaction_row.id is null then raise exception 'Transaksi tidak ditemukan.'; end if;
  if transaction_row.status = 'cancelled' then raise exception 'Transaksi sudah dibatalkan.'; end if;

  select array_agg(journal.id order by journal.journal_date, journal.created_at, journal.id)
    into original_journal_ids
    from public.journals as journal
    where journal.journal_type <> 'reversal'
      and journal.transaction_kind = transaction_type
      and journal.transaction_id = transaction_key;
  if coalesce(array_length(original_journal_ids, 1), 0) = 0 then raise exception 'Jurnal transaksi tidak ditemukan.'; end if;

  for source_journal in
    select journal.id, journal.journal_type, journal.journal_number, journal.created_at
    from public.journals as journal
    where journal.id = any(original_journal_ids)
    order by case
      when journal.journal_type = 'recognition' then 0
      when journal.journal_type = 'payment' then 1
      when journal.journal_type = 'correction' then 2
      else 3
    end, journal.created_at, journal.id
  loop
    select jsonb_agg(jsonb_build_object(
        'account_code', line.account_code,
        'debit', line.credit,
        'credit', line.debit
      ) order by case when line.credit > 0 then 0 else 1 end,
        line.account_code asc, line.id asc)
      into reversal_lines
      from public.journal_lines as line
      where line.journal_id = source_journal.id;
    if reversal_lines is null then
      raise exception 'Baris jurnal pembalik untuk jurnal % tidak ditemukan.', source_journal.id;
    end if;
    reversal_kind_label := case
      when source_journal.journal_type = 'recognition' then 'Pengakuan'
      when source_journal.journal_type = 'payment' then 'Pembayaran'
      when source_journal.journal_type = 'correction' then 'Koreksi'
      else 'Jurnal'
    end;
    reversal_description := 'Pembalik ' || reversal_kind_label || ' '
      || coalesce(source_journal.journal_number, transaction_row.slip_number,
        transaction_row.full_name || ' - ' || transaction_row.period_id)
      || ': ' || reason_value;
    reversal_journal_id := public.create_payroll_journal(current_date,
      reversal_description, 'reversal', transaction_type, transaction_key,
      reversal_lines, source_journal.id, reason_value,
      coalesce(source_journal.journal_number, transaction_row.slip_number));
    if first_reversal_journal_id is null then
      first_reversal_journal_id := reversal_journal_id;
    end if;
  end loop;
  if first_reversal_journal_id is null then raise exception 'Jurnal pembalik tidak berhasil dibuat.'; end if;

  perform set_config('arboria.allow_cancel', 'true', true);
  execute format('update public.%I set status = ''cancelled'', cancellation_reason = $2, cancelled_by = $3 where id = $1', transaction_table)
    using transaction_key, reason_value, 'Admin Arboria';
  update public.payroll_corrections
    set status = 'cancelled'
    where transaction_kind = transaction_type and original_transaction_id = transaction_key
      and status <> 'cancelled';
  insert into public.payroll_audit_trail (transaction_kind, transaction_id, action, actor, reason, slip_number)
    select correction.transaction_kind, correction.id, 'dibatalkan', 'Admin Arboria', reason_value, correction.slip_number
    from public.payroll_corrections as correction
    where correction.transaction_kind = transaction_type
      and correction.original_transaction_id = transaction_key;
  return first_reversal_journal_id;
end;
$$;

-- (c) Remove constraints and standalone indexes that depend on line_order.
do $$
declare
  constraint_row record;
  index_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.journal_lines'::regclass
      and position('line_order' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.journal_lines drop constraint %I', constraint_row.conname);
  end loop;

  for index_row in
    select namespace.nspname, index_class.relname
    from pg_index as index_data
    join pg_class as index_class on index_class.oid = index_data.indexrelid
    join pg_namespace as namespace on namespace.oid = index_class.relnamespace
    where index_data.indrelid = 'public.journal_lines'::regclass
      and position('line_order' in pg_get_indexdef(index_data.indexrelid)) > 0
  loop
    execute format('drop index %I.%I', index_row.nspname, index_row.relname);
  end loop;
end
$$;

-- (d) Drop the obsolete column only after views, functions and triggers are updated.
alter table public.journal_lines drop column line_order;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'journal_lines'
      and column_name = 'line_order'
  ) then
    raise exception 'journal_lines.line_order was not removed.';
  end if;
  if exists (
    select journal_id
    from public.journal_lines
    group by journal_id
    having sum(debit) <> sum(credit)
  ) then
    raise exception 'At least one journal is unbalanced after the migration.';
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;

select
  count(*) as journal_lines_count,
  coalesce(sum(debit), 0) as total_debit,
  coalesce(sum(credit), 0) as total_credit,
  coalesce(sum(debit), 0) = coalesce(sum(credit), 0) as overall_balanced
from public.journal_lines;

select
  account.code as account_code,
  account.name as account_name,
  account.normal_balance,
  coalesce(sum(line.debit), 0) as total_debit,
  coalesce(sum(line.credit), 0) as total_credit,
  case when account.normal_balance = 'credit'
    then coalesce(sum(line.credit), 0) - coalesce(sum(line.debit), 0)
    else coalesce(sum(line.debit), 0) - coalesce(sum(line.credit), 0)
  end as account_balance
from public.accounts as account
left join public.journal_lines as line on line.account_code = account.code
group by account.code, account.name, account.normal_balance
order by account.code;

select journal_id, sum(debit) as total_debit, sum(credit) as total_credit,
  sum(debit) = sum(credit) as balanced
from public.journal_lines
group by journal_id
order by journal_id;

select *
from public.journal_view
limit 50;

-- ============== END JOURNAL LINE ORDER MIGRATION ==============

-- =========== JOURNAL VIEW TRANSACTION ORDER MIGRATION ===========
-- Re-run this block alone to apply the same-day transaction ordering.
begin;

lock table public.journals in share row exclusive mode;

create or replace view public.journal_view
with (security_invoker = true)
as
select
  journal.id as journal_id,
  journal.journal_date,
  journal.journal_type,
  journal.description,
  journal.transaction_id,
  line.account_code,
  account.name as account_name,
  line.debit,
  line.credit
from public.journals as journal
join public.journal_lines as line on line.journal_id = journal.id
left join public.accounts as account on account.code = line.account_code
order by
  journal.journal_date asc,
  journal.transaction_kind asc,
  journal.transaction_id asc,
  case journal.journal_type
    when 'recognition' then 0
    when 'correction' then 1
    when 'payment' then 2
    when 'reversal' then 3
    else 4
  end asc,
  journal.created_at asc,
  journal.id asc,
  case when line.debit > 0 then 0 else 1 end asc,
  line.account_code asc,
  line.id asc;

grant select on public.journal_view to anon;
notify pgrst, 'reload schema';
commit;

select *
from public.journal_view
limit 50;

-- ======== END JOURNAL VIEW TRANSACTION ORDER MIGRATION ========

-- ======== ATTENDANCE EMPLOYEE FULL NAME MIGRATION ========
begin;

drop view if exists public.attendance_records_with_employee;
drop view if exists public.daily_attendance_with_employee;

alter table public.attendance_records
  add column if not exists full_name text;
alter table public.daily_attendance
  add column if not exists full_name text;

update public.attendance_records as attendance
set full_name = employee.full_name
from public.employees as employee
where employee.id = attendance.employee_id
  and attendance.full_name is distinct from employee.full_name;

update public.daily_attendance as attendance
set full_name = employee.full_name
from public.employees as employee
where employee.id = attendance.employee_id
  and attendance.full_name is distinct from employee.full_name;

alter table public.attendance_records
  alter column full_name set not null;
alter table public.daily_attendance
  alter column full_name set not null;

create or replace function public.fill_attendance_employee_full_name()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  select employee.full_name
    into new.full_name
    from public.employees as employee
    where employee.id = new.employee_id;

  if not found then
    raise exception 'Karyawan % tidak ditemukan.', new.employee_id;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_records_full_name_sync on public.attendance_records;
create trigger attendance_records_full_name_sync
  before insert or update on public.attendance_records
  for each row execute function public.fill_attendance_employee_full_name();

drop trigger if exists daily_attendance_full_name_sync on public.daily_attendance;
create trigger daily_attendance_full_name_sync
  before insert or update on public.daily_attendance
  for each row execute function public.fill_attendance_employee_full_name();

create or replace function public.sync_employee_full_name_to_attendance()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.attendance_records
  set full_name = new.full_name,
      updated_at = now()
  where employee_id = new.id
    and full_name is distinct from new.full_name;

  update public.daily_attendance
  set full_name = new.full_name
  where employee_id = new.id
    and full_name is distinct from new.full_name;

  return new;
end;
$$;

drop trigger if exists employees_sync_attendance_full_name on public.employees;
create trigger employees_sync_attendance_full_name
  after update of full_name on public.employees
  for each row when (old.full_name is distinct from new.full_name)
  execute function public.sync_employee_full_name_to_attendance();

notify pgrst, 'reload schema';
commit;

-- ======== END ATTENDANCE EMPLOYEE FULL NAME MIGRATION ========

-- ======== DAILY ATTENDANCE SUMMARY SYNC MIGRATION ========
begin;

lock table public.daily_attendance, public.attendance_records
  in share row exclusive mode;

create or replace function public.refresh_attendance_record_summary(
  employee_key uuid,
  attendance_day date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  employee_name text;
  period_value text := to_char(attendance_day, 'YYYY-MM');
  period_start date := date_trunc('month', attendance_day)::date;
  next_period_start date := (date_trunc('month', attendance_day) + interval '1 month')::date;
  present_count smallint;
  leave_count smallint;
  absent_count smallint;
  total_count integer;
begin
  perform pg_advisory_xact_lock(hashtext(
    'attendance-summary:' || employee_key::text || ':' || period_value
  ));

  select employee.full_name
    into employee_name
    from public.employees as employee
    where employee.id = employee_key;

  if not found then
    raise exception 'Karyawan % tidak ditemukan saat memperbarui rekap absensi.', employee_key;
  end if;

  select
    count(*) filter (where attendance.status = 'present')::smallint,
    count(*) filter (where attendance.status = 'leave')::smallint,
    count(*) filter (where attendance.status = 'absent')::smallint,
    count(*)::integer
    into present_count, leave_count, absent_count, total_count
    from public.daily_attendance as attendance
    where attendance.employee_id = employee_key
      and attendance.attendance_date >= period_start
      and attendance.attendance_date < next_period_start;

  if total_count = 0 then
    delete from public.attendance_records
    where employee_id = employee_key
      and period_id = period_value;
    return;
  end if;

  insert into public.attendance_records (
    employee_id, full_name, period_id, working_days, leave_days, absent_days
  )
  values (
    employee_key, employee_name, period_value,
    present_count, leave_count, absent_count
  )
  on conflict (employee_id, period_id) do update
  set full_name = excluded.full_name,
      working_days = excluded.working_days,
      leave_days = excluded.leave_days,
      absent_days = excluded.absent_days,
      updated_at = now();
end;
$$;

create or replace function public.sync_attendance_record_summary_from_daily()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_attendance_record_summary(old.employee_id, old.attendance_date);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.employee_id is distinct from new.employee_id
       or date_trunc('month', old.attendance_date) is distinct from date_trunc('month', new.attendance_date) then
      perform public.refresh_attendance_record_summary(old.employee_id, old.attendance_date);
    end if;
  end if;

  perform public.refresh_attendance_record_summary(new.employee_id, new.attendance_date);
  return new;
end;
$$;

revoke all on function public.refresh_attendance_record_summary(uuid, date)
  from public, anon, authenticated;

drop trigger if exists daily_attendance_summary_sync on public.daily_attendance;
create trigger daily_attendance_summary_sync
  after insert or update or delete on public.daily_attendance
  for each row execute function public.sync_attendance_record_summary_from_daily();

insert into public.attendance_records (
  employee_id, full_name, period_id, working_days, leave_days, absent_days
)
select
  attendance.employee_id,
  employee.full_name,
  to_char(attendance.attendance_date, 'YYYY-MM'),
  count(*) filter (where attendance.status = 'present')::smallint,
  count(*) filter (where attendance.status = 'leave')::smallint,
  count(*) filter (where attendance.status = 'absent')::smallint
from public.daily_attendance as attendance
join public.employees as employee on employee.id = attendance.employee_id
group by attendance.employee_id, employee.full_name, to_char(attendance.attendance_date, 'YYYY-MM')
on conflict (employee_id, period_id) do update
set full_name = excluded.full_name,
    working_days = excluded.working_days,
    leave_days = excluded.leave_days,
    absent_days = excluded.absent_days,
    updated_at = now();

notify pgrst, 'reload schema';
commit;

-- ======== END DAILY ATTENDANCE SUMMARY SYNC MIGRATION ========
