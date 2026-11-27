# Lybraria Backend (Express.js + PostgreSQL)

REST API backend untuk aplikasi mobile perpustakaan kampus **Lybraria**.

## Struktur Folder

```text
backend/
├── database/
│   ├── migrations/     # File migrasi skema database
│   ├── seeds/          # Script seeding data (misal akun Admin awal)
│   ├── schema.sql      # Skema tabel, ENUM, constraint, dan trigger PostgreSQL
│   └── seed.sql        # Data awal kategori & contoh buku
├── docs/               # Dokumentasi API (OpenAPI / Postman collection)
├── src/
│   ├── config/         # Konfigurasi database & environment
│   ├── constants/      # Konstanta aplikasi (role, status, tarif denda)
│   ├── controllers/    # Handler request & response HTTP
│   ├── middlewares/    # Auth JWT, RBAC, error handler, validasi
│   ├── repositories/   # Query SQL ke PostgreSQL
│   ├── routes/         # Definisi endpoint REST API
│   ├── services/       # Logika bisnis & transaksi
│   ├── utils/          # Helper (response formatter, JWT, hashing)
│   ├── validators/     # Validasi input request
│   ├── app.js          # Inisialisasi Express app
│   └── server.js       # Entry point server
├── tests/              # Unit & integration tests
├── .env.example        # Template environment variables
├── .gitignore
└── package.json
```

## Setup Lokal

1. Pastikan PostgreSQL sudah berjalan dan database `lybraria_db` sudah dibuat menggunakan `database/schema.sql`.
2. Salin `.env.example` menjadi `.env` lalu sesuaikan kredensial PostgreSQL dan secret JWT.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Jalankan server mode development:
   ```bash
   npm run dev
   ```
5. Cek health endpoint:
   ```text
   GET http://localhost:3000/api/health
   ```
