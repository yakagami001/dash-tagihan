-- Dash Tagihan: role user boleh menambah & mengubah tagihan (menu List Tagihan).
-- Menghapus tagihan tetap khusus admin (menu Master).

drop policy if exists "bills kelola admin"     on public.bills;
drop policy if exists "bills tambah user aktif" on public.bills;
drop policy if exists "bills ubah user aktif"   on public.bills;
drop policy if exists "bills hapus admin"       on public.bills;

create policy "bills tambah user aktif" on public.bills for insert with check (public.is_active_user());
create policy "bills ubah user aktif"   on public.bills for update using (public.is_active_user()) with check (public.is_active_user());
create policy "bills hapus admin"       on public.bills for delete using (public.is_admin());
-- "bills baca user aktif" (select) dari migrasi 20261030000000 tetap berlaku.
