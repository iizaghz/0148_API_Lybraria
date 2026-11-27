# Lybraria Backend (Express.js + PostgreSQL)

REST API backend untuk aplikasi mobile perpustakaan kampus **Lybraria** berdasarkan spesifikasi `Lybraria_SRS_0148.docx`.

## Struktur Folder

```text
backend/
├── database/
│   ├── migrations/     # File migrasi skema database
│   ├── seeds/          # Script seeding akun awal (seedAdmin.js)
│   ├── schema.sql      # Skema tabel, ENUM, constraint, dan trigger PostgreSQL
│   └── seed.sql        # Data awal kategori & contoh buku
├── docs/               # Dokumentasi API (OpenAPI / Postman collection)
├── src/
│   ├── config/         # Konfigurasi database PostgreSQL (pg Pool)
│   ├── constants/      # Konstanta aplikasi (role, status enum, tarif denda)
│   ├── controllers/    # Handler request & response HTTP
│   ├── middlewares/    # Auth JWT, RBAC, error handler
│   ├── repositories/   # Query SQL terparameterisasi ke PostgreSQL
│   ├── routes/         # Definisi endpoint REST API
│   ├── services/       # Logika bisnis & transaksi ACID
│   ├── utils/          # Helper (response formatter, JWT, hashing, AppError)
│   ├── validators/     # Validasi input request
│   ├── app.js          # Inisialisasi Express app
│   └── server.js       # Entry point server
├── tests/              # Integration tests (node:test)
├── .env.example        # Template environment variables
├── .gitignore
└── package.json
```

## Setup Lokal

1. Buat database PostgreSQL `lybraria_db` lalu terapkan `database/schema.sql` dan `database/seed.sql`.
2. Salin `.env.example` menjadi `.env` lalu sesuaikan kredensial PostgreSQL dan secret JWT.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Buat akun Admin awal & Anggota contoh:
   ```bash
   npm run seed:admin
   ```
5. Jalankan server mode development:
   ```bash
   npm run dev
   ```
6. Jalankan seluruh integration test:
   ```bash
   npm test
   ```

## Daftar Endpoint REST API

### Health & Dashboard
- `GET /api/health` — Cek status server dan koneksi PostgreSQL.
- `GET /api/dashboard/summary` *(Admin)* — Ringkasan statistik perpustakaan.

### Authentication & Session (FR-01 s/d FR-08)
- `POST /api/auth/login` — Login Admin/Anggota menggunakan email atau NIM.
- `POST /api/auth/refresh` — Pembaruan Access Token & rotasi Refresh Token.
- `GET /api/auth/me` *(Auth)* — Profil akun sesi aktif.
- `POST /api/auth/logout` *(Auth)* — Revokasi Refresh Token sesi aktif.

### Category Management (FR-16 s/d FR-21)
- `GET /api/categories` *(Auth)* — Daftar & cari kategori (`?q=`).
- `GET /api/categories/:id` *(Auth)* — Detail kategori beserta jumlah buku aktif.
- `POST /api/categories` *(Admin)* — Tambah kategori baru.
- `PUT /api/categories/:id` *(Admin)* — Perbarui kategori.
- `DELETE /api/categories/:id` *(Admin)* — Hapus kategori (RESTRICT jika masih dipakai buku).

### Book Management (FR-09 s/d FR-14)
- `GET /api/books` *(Auth)* — Katalog & cari buku (`?q=&id_kategori=&available_only=true`).
- `GET /api/books/:id` *(Auth)* — Detail buku & stok tersedia.
- `POST /api/books` *(Admin)* — Tambah koleksi buku baru.
- `PUT / PATCH /api/books/:id` *(Admin)* — Perbarui data & stok buku.
- `DELETE /api/books/:id` *(Admin)* — Soft-delete buku (`is_active = FALSE`) jika tanpa peminjaman aktif.

### Member Management (FR-22 s/d FR-28)
- `GET /api/members/me` *(Auth)* — Profil keanggotaan pribadi & ringkasan tanggungan.
- `GET /api/members` *(Admin)* — Daftar & cari anggota (`?q=&status_akun=`).
- `GET /api/members/:id` *(Admin)* — Detail anggota & ringkasan peminjaman aktif.
- `POST /api/members` *(Admin)* — Daftarkan akun anggota mahasiswa baru.
- `PUT / PATCH /api/members/:id` *(Admin)* — Perbarui profil/status akun anggota.
- `DELETE /api/members/:id` *(Admin)* — Soft-delete akun (`NONAKTIF`) jika tanpa tanggungan aktif.

### Borrowing & Return Management (FR-29 s/d FR-39)
- `GET /api/loans` *(Auth)* — Daftar & cari transaksi (`?q=&status_peminjaman=`); otomatis deteksi `TERLAMBAT`.
- `GET /api/loans/:id` *(Auth)* — Detail transaksi peminjaman.
- `POST /api/loans` *(Anggota / Admin)* — Pengajuan peminjaman (`DIAJUKAN`) atau peminjaman langsung (`DIPINJAM`).
- `PATCH /api/loans/:id/approve` *(Admin)* — Setujui pengajuan & kurangi stok atomik.
- `PATCH /api/loans/:id/reject` *(Admin)* — Tolak pengajuan peminjaman.
- `PATCH /api/loans/:id/cancel` *(Anggota)* — Batalkan pengajuan sendiri yang masih `DIAJUKAN`.
- `PATCH /api/loans/:id/return` *(Admin)* — Proses pengembalian, pulihkan stok atomik, & buat denda otomatis bila terlambat.
- `DELETE /api/loans/:id` *(Admin)* — Hapus catatan berstatus `DITOLAK` / `DIBATALKAN` tanpa denda.

### Late Fine Management (FR-40 s/d FR-46)
- `GET /api/fines` *(Auth)* — Daftar & cari denda (`?q=&status_denda=`).
- `GET /api/fines/:id` *(Auth)* — Detail catatan denda.
- `POST /api/fines` *(Admin)* — Buat catatan denda korektif.
- `PUT / PATCH /api/fines/:id` *(Admin)* — Koreksi nominal/keterangan atau status denda.
- `PATCH /api/fines/:id/pay` *(Admin)* — Catat pelunasan tunai di perpustakaan (`LUNAS`).
- `DELETE /api/fines/:id` *(Admin)* — Hapus catatan denda korektif berstatus `BELUM_LUNAS`.
