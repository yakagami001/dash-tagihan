# dash-tagihan

Dashboard checklist tagihan & cicilan bulanan: total yang harus dibayar per bulan, yang sudah dan belum dibayar, peringatan dini (EWS) jatuh tempo, input tagihan baru, serta histori dan proyeksi 12 bulan.

## Struktur

```
web/                      Front end statis (dideploy ke GitHub Pages)
  index.html              Tampilan
  app.js                  Logika checklist, EWS, chart, form
  store.js                Lapisan data: Supabase, atau localStorage bila config kosong
  config.js               URL + anon key Supabase (kosong = mode lokal)
supabase/
  migrations/             Skema tabel bills, payments, settings + Row Level Security
  functions/ews-reminder/ Edge Function pengingat terjadwal via Telegram
  seed.example.sql        Data contoh
  seed.local.sql          Data pribadi (di-.gitignore, tidak ikut ter-commit)
.github/workflows/pages.yml  Deploy web/ ke GitHub Pages setiap push ke main
```

## Model data

- **bills**: satu cicilan berulang. Jadwalnya dihitung dari `start_period` (bulan jatuh tempo pertama, `YYYY-MM`), `due_day` (tanggal tiap bulan), dan `tenor` (jumlah bulan tersisa).
- **payments**: satu cicilan pada satu bulan yang sudah dibayar. `id = <bill_id>__<YYYY-MM>`. Mencentang di checklist = insert, menghapus centang = delete.
- **settings**: `cutoff_day` (default 25: mulai tanggal 25, "bulan berjalan" pindah ke bulan depan), `warn_days` (default 3), `telegram_chat_id` (opsional).

## Branch

- `main` — produksi, otomatis dideploy ke GitHub Pages.
- `dev` — pengembangan. Kerjakan di `dev`, lalu buat PR `dev → main`.

## Menyambungkan Supabase

1. Buat project di supabase.com.
2. Jalankan `supabase/migrations/20261028000000_init.sql` di SQL Editor (atau `supabase db push` via CLI).
3. Authentication → URL Configuration: tambahkan URL GitHub Pages ke *Site URL* dan *Redirect URLs*.
4. Isi `web/config.js` dengan Project URL dan anon key (Project Settings → API). Anon key aman di browser karena RLS hanya mengizinkan baris milik user yang login.
5. Buka web, login lewat link email, lalu jalankan `seed.local.sql` (ganti `EMAIL_ANDA`) di SQL Editor.

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

Settings → Pages → Source: **GitHub Actions**. Alamat situs: `https://<username>.github.io/dash-tagihan/`.
Alamat `https://dash-tagihan.github.io` hanya bisa dipakai bila ada akun/organisasi GitHub bernama `dash-tagihan` dengan repo `dash-tagihan.github.io`.

Tanpa `config.js`, situs berjalan dalam mode lokal (data di browser masing-masing), sehingga tidak ada data pribadi yang terbuka.
