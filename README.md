# dash-tagihan

Dashboard checklist tagihan & cicilan bulanan: total yang harus dibayar per bulan, yang sudah dan belum dibayar, peringatan dini (EWS) jatuh tempo, input tagihan baru, serta histori dan proyeksi 12 bulan.

## Struktur

```
docs/                     Front end statis (dipublikasikan GitHub Pages)
  index.html              Halaman login, ganti password, dan aplikasi (Dashboard, Master)
  styles.css              Tema korporat putih + navy
  app.js                  Alur login/captcha, routing menu, dashboard, master tagihan, setting user
  api.js                  Akses Supabase (auth, tabel, fungsi admin)
  config.js               URL + publishable key Supabase
supabase/
  migrations/             Skema tabel bills, payments, settings, app_users + Row Level Security + fungsi admin
  functions/ews-reminder/ Edge Function pengingat terjadwal via Telegram
  seed.example.sql        Data contoh
  seed.local.sql          Data pribadi (di-.gitignore, tidak ikut ter-commit)
.github/workflows/pages.yml  Deploy docs/ ke GitHub Pages setiap push ke main
```

## Model data

- **bills**: satu cicilan berulang. Jadwalnya dihitung dari `start_period` (bulan jatuh tempo pertama, `YYYY-MM`), `due_day` (tanggal tiap bulan), dan `tenor` (jumlah bulan tersisa).
- **payments**: satu cicilan pada satu bulan yang sudah dibayar. `id = <bill_id>__<YYYY-MM>`. Mencentang di checklist = insert, menghapus centang = delete.
- **settings**: `cutoff_day` (default 25: mulai tanggal 25, "bulan berjalan" pindah ke bulan depan), `warn_days` (default 3), `telegram_chat_id` (opsional).

## Branch

- `main` — produksi, otomatis dideploy ke GitHub Pages.
- `dev` — pengembangan. Kerjakan di `dev`, lalu buat PR `dev → main`.

## Login & user

- Login memakai **username + password + captcha**. Username dipetakan ke email internal `<username>@dash-tagihan.local` di Supabase Auth; password disimpan ter-hash (bcrypt).
- Akun awal: **`admin.tagihan` / `P@ssw0rd`**. Saat login pertama user diarahkan ke halaman ganti password; sebelum diganti, database menolak akses data (`is_active_user()` mensyaratkan `must_reset = false`).
- Role **user** hanya melihat Dashboard & Kalkulator Budget dan boleh konfirmasi pembayaran. Menu **Master** (Data Master Tagihan, Setting User) khusus **admin**, juga dikunci di database (`20261030000000_role_access.sql`).
- Menu **Master → Setting User** (khusus admin): tambah user (password awal `P@ssw0rd`), ubah nama/role/status, reset password ke default, hapus user.
- Data tagihan dipakai bersama oleh semua user aktif.
- Captcha dibuat di browser (penghalang login otomatis sederhana) dan login dikunci 60 detik setelah 5 kali gagal. Untuk proteksi di sisi server, aktifkan CAPTCHA protection (hCaptcha/Turnstile) di Supabase Auth.

## Menyambungkan Supabase

1. Buat project di supabase.com.
2. Jalankan berurutan di SQL Editor: `supabase/migrations/20261028000000_init.sql`, `20261029000000_app_users.sql`, lalu `20261030000000_role_access.sql` (atau `supabase db push` via CLI).
3. Isi `docs/config.js` dengan Project URL dan publishable/anon key (Project Settings → API). Key ini aman di browser karena RLS membatasi akses ke user yang login.
4. Opsional: jalankan `seed.local.sql` di SQL Editor untuk memasukkan data tagihan awal.

## Pengingat otomatis (opsional)

```bash
supabase functions deploy ews-reminder
supabase secrets set TELEGRAM_BOT_TOKEN=xxxx
```

Isi `settings.telegram_chat_id`, lalu jadwalkan tiap pagi 07:00 WIB (00:00 UTC) dengan pg_cron + pg_net:

```sql
select cron.schedule('ews-reminder', '0 0 * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/ews-reminder',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  );
$$);
```

## GitHub Pages

Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, folder `/docs`. Alamat situs: `https://<username>.github.io/dash-tagihan/`.
Alamat `https://dash-tagihan.github.io` hanya bisa dipakai bila ada akun/organisasi GitHub bernama `dash-tagihan` dengan repo `dash-tagihan.github.io`.

Tanpa `config.js`, situs berjalan dalam mode lokal (data di browser masing-masing), sehingga tidak ada data pribadi yang terbuka.
