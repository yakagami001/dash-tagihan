-- Dash Tagihan: skema awal
-- Model: satu baris "bills" = satu cicilan berulang. Jadwalnya dihitung dari
-- start_period (bulan jatuh tempo pertama) + tenor (jumlah bulan) + due_day.
-- Satu baris "payments" = satu cicilan bulan tertentu yang sudah dibayar (id = <bill_id>__<YYYY-MM>).

create table if not exists public.bills (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  platform      text not null,
  note          text not null default '',
  amount        bigint not null check (amount > 0),
  tenor         int  not null check (tenor between 1 and 120),
  due_day       int  not null check (due_day between 1 and 31),
  start_period  text not null check (start_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at    timestamptz not null default now()
);

create table if not exists public.payments (
  id        text primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bill_id   text not null references public.bills(id) on delete cascade,
  period    text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount    bigint not null,
  paid_at   timestamptz not null default now(),
  unique (bill_id, period)
);

create table if not exists public.settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  cutoff_day  int not null default 25,   -- mulai tanggal ini, "bulan berjalan" = bulan depan
  warn_days   int not null default 3,    -- EWS kuning jika jatuh tempo <= N hari
  telegram_chat_id text                  -- opsional, untuk edge function ews-reminder
);

create index if not exists bills_user_idx on public.bills(user_id);
create index if not exists payments_user_period_idx on public.payments(user_id, period);

alter table public.bills    enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;

create policy "bills milik sendiri"    on public.bills    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "payments milik sendiri" on public.payments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings milik sendiri" on public.settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime untuk sinkron antar perangkat
alter publication supabase_realtime add table public.bills, public.payments;
