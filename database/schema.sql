-- ============================================================================
-- Lybraria Database Schema (PostgreSQL)
-- Referensi: Lybraria_SRS_0148.docx (Bab 6: ERD & RAT)
-- ============================================================================

-- 1. ENUM Types
DO $$ BEGIN
    CREATE TYPE role_enum AS ENUM ('ADMIN', 'ANGGOTA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_akun_enum AS ENUM ('AKTIF', 'NONAKTIF');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_peminjaman_enum AS ENUM (
        'DIAJUKAN',
        'DIPINJAM',
        'DIKEMBALIKAN',
        'TERLAMBAT',
        'DITOLAK',
        'DIBATALKAN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE status_denda_enum AS ENUM ('BELUM_LUNAS', 'LUNAS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Trigger Function untuk auto-update kolom updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Tabel: kategori
CREATE TABLE IF NOT EXISTS kategori (
    id_kategori     SERIAL PRIMARY KEY,
    nama_kategori   VARCHAR(100) NOT NULL UNIQUE,
    deskripsi       TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DROP TRIGGER IF EXISTS set_updated_at_kategori ON kategori;
CREATE TRIGGER set_updated_at_kategori
BEFORE UPDATE ON kategori
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- 4. Tabel: buku
CREATE TABLE IF NOT EXISTS buku (
    id_buku         SERIAL PRIMARY KEY,
    id_kategori     INTEGER NOT NULL,
    kode_buku       VARCHAR(30) NOT NULL UNIQUE,
    isbn            VARCHAR(20) UNIQUE,
    judul           VARCHAR(200) NOT NULL,
    penulis         VARCHAR(150) NOT NULL,
    penerbit        VARCHAR(150) NOT NULL,
    tahun_terbit    INTEGER NOT NULL,
    stok_total      INTEGER NOT NULL CHECK (stok_total >= 0),
    stok_tersedia   INTEGER NOT NULL CHECK (stok_tersedia >= 0 AND stok_tersedia <= stok_total),
    lokasi_rak      VARCHAR(50),
    deskripsi       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_buku_kategori
        FOREIGN KEY (id_kategori)
        REFERENCES kategori(id_kategori)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS set_updated_at_buku ON buku;
CREATE TRIGGER set_updated_at_buku
BEFORE UPDATE ON buku
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_buku_id_kategori ON buku(id_kategori);
CREATE INDEX IF NOT EXISTS idx_buku_is_active ON buku(is_active);
CREATE INDEX IF NOT EXISTS idx_buku_judul ON buku(judul);

-- 5. Tabel: anggota
CREATE TABLE IF NOT EXISTS anggota (
    id_anggota          SERIAL PRIMARY KEY,
    nim                 VARCHAR(20) UNIQUE,
    nama_lengkap        VARCHAR(150) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    program_studi       VARCHAR(100),
    no_telepon          VARCHAR(20),
    role                role_enum NOT NULL,
    status_akun         status_akun_enum NOT NULL DEFAULT 'AKTIF',
    refresh_token_hash  VARCHAR(255),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_anggota_nim
        CHECK (role <> 'ANGGOTA' OR (nim IS NOT NULL AND BTRIM(nim) <> ''))
);

DROP TRIGGER IF EXISTS set_updated_at_anggota ON anggota;
CREATE TRIGGER set_updated_at_anggota
BEFORE UPDATE ON anggota
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_anggota_role ON anggota(role);
CREATE INDEX IF NOT EXISTS idx_anggota_status_akun ON anggota(status_akun);

-- 6. Tabel: peminjaman
CREATE TABLE IF NOT EXISTS peminjaman (
    id_peminjaman       SERIAL PRIMARY KEY,
    kode_peminjaman     VARCHAR(30) NOT NULL UNIQUE,
    id_anggota          INTEGER NOT NULL,
    id_buku             INTEGER NOT NULL,
    jumlah              INTEGER NOT NULL DEFAULT 1 CHECK (jumlah >= 1),
    tanggal_pengajuan   DATE NOT NULL DEFAULT CURRENT_DATE,
    tanggal_pinjam      DATE,
    tanggal_jatuh_tempo DATE,
    tanggal_kembali     DATE,
    status_peminjaman   status_peminjaman_enum NOT NULL DEFAULT 'DIAJUKAN',
    catatan             TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_peminjaman_anggota
        FOREIGN KEY (id_anggota)
        REFERENCES anggota(id_anggota)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_peminjaman_buku
        FOREIGN KEY (id_buku)
        REFERENCES buku(id_buku)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_tanggal_kembali
        CHECK (tanggal_kembali IS NULL OR tanggal_pinjam IS NULL OR tanggal_kembali >= tanggal_pinjam)
);

DROP TRIGGER IF EXISTS set_updated_at_peminjaman ON peminjaman;
CREATE TRIGGER set_updated_at_peminjaman
BEFORE UPDATE ON peminjaman
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_peminjaman_id_anggota ON peminjaman(id_anggota);
CREATE INDEX IF NOT EXISTS idx_peminjaman_id_buku ON peminjaman(id_buku);
CREATE INDEX IF NOT EXISTS idx_peminjaman_status ON peminjaman(status_peminjaman);

-- 7. Tabel: denda
CREATE TABLE IF NOT EXISTS denda (
    id_denda        SERIAL PRIMARY KEY,
    id_peminjaman   INTEGER NOT NULL UNIQUE,
    hari_terlambat  INTEGER NOT NULL CHECK (hari_terlambat >= 0),
    tarif_per_hari  NUMERIC(10, 2) NOT NULL DEFAULT 1000.00 CHECK (tarif_per_hari >= 0),
    total_denda     NUMERIC(10, 2) NOT NULL CHECK (total_denda >= 0),
    status_denda    status_denda_enum NOT NULL DEFAULT 'BELUM_LUNAS',
    tanggal_bayar   DATE,
    keterangan      TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_denda_peminjaman
        FOREIGN KEY (id_peminjaman)
        REFERENCES peminjaman(id_peminjaman)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS set_updated_at_denda ON denda;
CREATE TRIGGER set_updated_at_denda
BEFORE UPDATE ON denda
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_denda_status ON denda(status_denda);
