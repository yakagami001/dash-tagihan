-- Contoh data (bukan data asli). Untuk data sendiri, buat seed.local.sql (sudah di-.gitignore).
-- Jalankan di Supabase SQL Editor setelah semua file di supabase/migrations dijalankan.
do $$
declare uid uuid := (select user_id from public.app_users where username = 'admin.tagihan');
begin
  if uid is null then raise exception 'Jalankan migrasi 20261029000000_app_users.sql dulu'; end if;
  insert into public.bills (id,user_id,platform,note,amount,tenor,due_day,start_period) values
    ('contoh-1',uid,'Contoh Paylater','Belanja online',250000,3,5,'2026-11'),
    ('contoh-2',uid,'Contoh Kartu Kredit','',480000,6,20,'2026-11'),
    ('contoh-3',uid,'Contoh Pinjaman','',1200000,12,27,'2026-11')
  on conflict (id) do nothing;
  insert into public.payments (id,user_id,bill_id,period,amount) values
    ('contoh-1__2026-11',uid,'contoh-1','2026-11',250000)
  on conflict (id) do nothing;
end $$;
