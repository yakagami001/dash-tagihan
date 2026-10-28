-- Dash Tagihan: login dengan username, manajemen user, wajib ganti password.
-- Login memakai Supabase Auth (password di-hash bcrypt oleh Postgres/GoTrue, tidak pernah disimpan polos).
-- Username dipetakan ke email internal: <username>@dash-tagihan.local
-- Data tagihan dipakai bersama oleh semua user aktif yang sudah mengganti password default.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.app_users (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  username            text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  full_name           text not null default '',
  role                text not null default 'user' check (role in ('admin','user')),
  active              boolean not null default true,
  must_reset          boolean not null default true,
  password_changed_at timestamptz,
  created_at          timestamptz not null default now()
);
alter table public.app_users enable row level security;

-- User aktif & sudah ganti password default -> boleh akses data
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and active and not must_reset);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where user_id = auth.uid() and active and not must_reset and role = 'admin');
$$;

drop policy if exists "app_users baca" on public.app_users;
create policy "app_users baca" on public.app_users for select
  using (user_id = auth.uid() or public.is_active_user());
-- Tidak ada policy insert/update/delete: perubahan user hanya lewat fungsi admin_* di bawah.

-- Data tagihan: bersama untuk semua user aktif. Hapus user tidak menghapus tagihan.
alter table public.bills    alter column user_id drop not null;
alter table public.payments alter column user_id drop not null;
alter table public.bills    drop constraint if exists bills_user_id_fkey;
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.bills    add constraint bills_user_id_fkey    foreign key (user_id) references auth.users(id) on delete set null;
alter table public.payments add constraint payments_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;

drop policy if exists "bills milik sendiri"    on public.bills;
drop policy if exists "payments milik sendiri" on public.payments;
drop policy if exists "settings milik sendiri" on public.settings;
drop policy if exists "bills user aktif"       on public.bills;
drop policy if exists "payments user aktif"    on public.payments;
drop policy if exists "settings user aktif"    on public.settings;
create policy "bills user aktif"    on public.bills    for all using (public.is_active_user()) with check (public.is_active_user());
create policy "payments user aktif" on public.payments for all using (public.is_active_user()) with check (public.is_active_user());
create policy "settings user aktif" on public.settings for all using (public.is_active_user()) with check (public.is_active_user());

-- Internal: buat akun login. Tidak bisa dipanggil dari browser.
create or replace function public._create_login(p_username text, p_full_name text, p_role text, p_password text)
returns uuid language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  uid uuid := gen_random_uuid();
  uname text := lower(trim(p_username));
  em text := uname || '@dash-tagihan.local';
begin
  if uname !~ '^[a-z0-9._-]{3,32}$' then raise exception 'Username hanya huruf kecil, angka, titik, minus, underscore (3-32 karakter)'; end if;
  if exists (select 1 from public.app_users where username = uname) or exists (select 1 from auth.users where email = em) then
    raise exception 'Username % sudah dipakai', uname;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('username', uname), now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  insert into public.app_users (user_id, username, full_name, role) values (uid, uname, coalesce(p_full_name, ''), p_role);
  return uid;
end $$;
revoke all on function public._create_login(text, text, text, text) from public, anon, authenticated;

-- Dipanggil user sendiri setelah berhasil ganti password
create or replace function public.mark_password_changed() returns void
language sql security definer set search_path = public as $$
  update public.app_users set must_reset = false, password_changed_at = now() where user_id = auth.uid();
$$;

create or replace function public.admin_create_user(p_username text, p_full_name text, p_role text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  return public._create_login(p_username, p_full_name, coalesce(p_role, 'user'), 'P@ssw0rd');
end $$;

create or replace function public.admin_update_user(p_user_id uuid, p_full_name text, p_role text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    raise exception 'Tidak bisa menonaktifkan atau menurunkan role akun sendiri';
  end if;
  update public.app_users set full_name = p_full_name, role = p_role, active = p_active where user_id = p_user_id;
end $$;

create or replace function public.admin_reset_password(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  update auth.users set encrypted_password = extensions.crypt('P@ssw0rd', extensions.gen_salt('bf')), updated_at = now() where id = p_user_id;
  update public.app_users set must_reset = true, password_changed_at = null where user_id = p_user_id;
end $$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  if p_user_id = auth.uid() then raise exception 'Tidak bisa menghapus akun sendiri'; end if;
  delete from auth.users where id = p_user_id;
end $$;

revoke all on function public.admin_create_user(text, text, text), public.admin_update_user(uuid, text, text, boolean),
  public.admin_reset_password(uuid), public.admin_delete_user(uuid), public.mark_password_changed() from public, anon;
grant execute on function public.admin_create_user(text, text, text), public.admin_update_user(uuid, text, text, boolean),
  public.admin_reset_password(uuid), public.admin_delete_user(uuid), public.mark_password_changed() to authenticated;

-- Akun admin default: admin.tagihan / P@ssw0rd (wajib diganti saat login pertama)
do $$
begin
  if not exists (select 1 from public.app_users where username = 'admin.tagihan') then
    perform public._create_login('admin.tagihan', 'Administrator', 'admin', 'P@ssw0rd');
  end if;
end $$;
