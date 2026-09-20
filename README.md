# HERÉA

Private, deterministic women's wellness tracking. It does not diagnose or replace professional care.

Saat ini data disimpan di **file JSON** (folder `data/`), bukan database. Struktur datanya
**identik dengan `db/schema.sql`** (PostgreSQL), sehingga bisa dimigrasi kapan saja.

## Menjalankan

```bash
npm install
npm run dev        # atau: npm start
```

Buka http://localhost:3000. Tidak perlu `.env` atau database. Folder `data/` dan seluruh file
tabelnya dibuat otomatis; rahasia JWT dibuat di `data/.jwt_secret` bila `JWT_SECRET` kosong.

Perintah lain: `npm test` · `npm run typecheck` · `npm run lint` · `npm run build`

## Bagaimana data disimpan

| Tabel di schema.sql | File |
|---|---|
| `users`, `health_profiles`, `user_settings`, ... (18 tabel) | `data/<nama_tabel>.json` |

- Setiap file = array baris. Nama kolom, nilai enum, dan tipe sama dengan SQL
  (`DATE` → `"YYYY-MM-DD"`, `TIMESTAMPTZ` → ISO UTC, `UUID` → string, `health_goals` → array).
- Aturan schema ditegakkan saat menulis: NOT NULL, enum, CHECK, UNIQUE, FOREIGN KEY, dan
  `ON DELETE CASCADE / RESTRICT / SET NULL`.
- Penulisan atomik (file sementara + rename). File yang rusak tidak akan ditimpa.
- `symptoms` dan `moods` di-seed otomatis (sama dengan seed SQL, dengan UUID tetap).
- "Hari ini" mengikuti zona waktu pengguna (`user_settings.timezone`, default `Asia/Jakarta`).
- Jalankan **satu** proses server saja (data ada di memori + file).
- Folder `data/` berisi data kesehatan: sudah di `.gitignore`.

## Migrasi ke PostgreSQL (manual)

```bash
# 1. Periksa data terhadap aturan schema.sql
npm run data:check

# 2. Buat database + tabel dari schema milikmu
createdb herea
psql herea -v ON_ERROR_STOP=1 -f db/schema.sql

# 3. Hasilkan SQL dari file JSON, lalu muat
npm run data:export-sql                      # -> data/export/herea-data.sql
psql herea -v ON_ERROR_STOP=1 -f data/export/herea-data.sql
```

Di akhir, skrip menampilkan tabel perbandingan jumlah baris DB vs JSON. Catatan:

- Skrip menolak berjalan bila tabel `users` sudah berisi (hanya untuk database baru).
- Seed `symptoms`/`moods` dari `schema.sql` diganti dengan versi JSON, karena baris lain
  mereferensikan UUID-nya.
- Hash password (argon2) dan token JWT tetap valid setelah pindah.
- Mengganti aplikasi agar **membaca dari PostgreSQL** (bukan sekadar memindahkan data) berarti
  mengganti lapisan `src/db/` dengan klien `pg`/Prisma; route memakai API sinkron `db.<tabel>`,
  jadi perlu diubah menjadi async.

## Struktur

```
db/schema.sql          schema PostgreSQL (sumber kebenaran)
src/db/                types.ts (enum & baris), schema.ts (metadata), database.ts (engine JSON)
src/routes/            endpoint API      src/services/  skor, insight, siklus
health-engine/         logika deterministik (skor, red flag, siklus, insight)
scripts/               check-data · export-sql · reset-data
tests/                 termasuk schema-parity.test.ts (membandingkan kode vs schema.sql)
```

`tests/schema-parity.test.ts` membaca `db/schema.sql` dan gagal bila tabel, kolom, tipe, FK,
atau UNIQUE di kode berbeda dari SQL. Jalankan ulang setelah mengubah salah satunya.

## API (semua di bawah `/api`, kecuali auth butuh header `Authorization: Bearer <token>`)

`auth/register|login|logout|me` · `profile` · `health-profile` · `settings` · `symptoms` · `moods` ·
`cycles` (+`/:id`, `/:id/symptoms`) · `cycle-analysis` · `period` · `sleep` · `hydration` · `activity` ·
`checkins` · `today` · `dashboard` · `wellness` · `wellness/score` · `insights` · `journal` · `notifications`

Field memakai nama kolom SQL (snake_case), mis. `start_date`, `duration_minutes`, `mood_id`.
