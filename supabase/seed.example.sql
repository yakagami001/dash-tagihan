-- Contoh data (bukan data asli). Untuk data sendiri, buat seed.local.sql (sudah di-.gitignore).
-- Jalankan di Supabase SQL Editor setelah login sekali lewat web. Ganti EMAIL_ANDA.
do $$
declare uid uuid := (select id from auth.users where email = 'EMAIL_ANDA');
begin
  if uid is null then raise exception 'User belum terdaftar. Login dulu lewat web.'; end if;
  insert into public.bills (id,user_id,platform,note,amount,tenor,due_day,start_period) values
    ('contoh-1',uid,'Contoh Paylater','Belanja online',250000,3,5,'2026-11'),
    ('contoh-2',uid,'Contoh Kartu Kredit','',480000,6,20,'2026-11'),
    ('contoh-3',uid,'Contoh Pinjaman','',1200000,12,27,'2026-11')
  on conflict (id) do nothing;
  insert into public.payments (id,user_id,bill_id,period,amount) values
    ('contoh-1__2026-11',uid,'contoh-1','2026-11',250000)
  on conflict (id) do nothing;
  insert into public.settings (user_id) values (uid) on conflict do nothing;
end $$;
