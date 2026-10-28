-- Dash Tagihan: hak akses per role.
-- admin : semua menu (Dashboard, Kalkulator, Data Master Tagihan, Setting User)
-- user  : Dashboard & Kalkulator; boleh konfirmasi pembayaran, tidak boleh mengubah data master tagihan.

drop policy if exists "bills user aktif"        on public.bills;
drop policy if exists "bills baca user aktif"   on public.bills;
drop policy if exists "bills kelola admin"      on public.bills;

create policy "bills baca user aktif" on public.bills for select using (public.is_active_user());
create policy "bills kelola admin"    on public.bills for all    using (public.is_admin()) with check (public.is_admin());

-- payments tetap boleh ditulis semua user aktif (konfirmasi pembayaran) — policy "payments user aktif" dari migrasi sebelumnya.
