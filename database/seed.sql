-- ============================================================================
-- Lybraria Seed Data Awal (PostgreSQL)
-- Catatan: password_hash di bawah menggunakan placeholder bcrypt.
-- Saat setup backend Express.js nanti, kita bisa jalankan script seed Node.js
-- agar hash password dibuat langsung oleh bcryptjs/bcrypt.
-- ============================================================================

-- 1. Kategori Buku Awal
INSERT INTO kategori (nama_kategori, deskripsi) VALUES
    ('Teknologi Informasi', 'Buku pemrograman, jaringan komputer, basis data, dan rekayasa perangkat lunak.'),
    ('Sains & Matematika', 'Buku kalkulus, aljabar linear, statistika, fisika, dan ilmu pengetahuan alam.'),
    ('Sastra & Fiksi', 'Novel, kumpulan cerpen, dan karya sastra Indonesia maupun dunia.'),
    ('Bisnis & Ekonomi', 'Manajemen, kewirausahaan, akuntansi, dan ekonomi mikro/makro.')
ON CONFLICT (nama_kategori) DO NOTHING;

-- 2. Contoh Koleksi Buku Awal
INSERT INTO buku (
    id_kategori, kode_buku, isbn, judul, penulis, penerbit, tahun_terbit,
    stok_total, stok_tersedia, lokasi_rak, deskripsi
) VALUES
    (
        (SELECT id_kategori FROM kategori WHERE nama_kategori = 'Teknologi Informasi'),
        'BK-TI-001', '978-0132350884',
        'Clean Code: A Handbook of Agile Software Craftsmanship',
        'Robert C. Martin', 'Prentice Hall', 2008,
        5, 5, 'RAK-A1',
        'Panduan praktik terbaik menulis kode yang bersih dan mudah dipelihara.'
    ),
    (
        (SELECT id_kategori FROM kategori WHERE nama_kategori = 'Teknologi Informasi'),
        'BK-TI-002', '978-1491950357',
        'Designing Data-Intensive Applications',
        'Martin Kleppmann', 'O''Reilly Media', 2017,
        3, 3, 'RAK-A2',
        'Konsep arsitektur sistem terdistribusi, basis data, dan pengolahan data skala besar.'
    ),
    (
        (SELECT id_kategori FROM kategori WHERE nama_kategori = 'Sains & Matematika'),
        'BK-SM-001', '978-1285740621',
        'Calculus: Early Transcendentals',
        'James Stewart', 'Cengage Learning', 2015,
        4, 4, 'RAK-B1',
        'Buku teks kalkulus untuk mahasiswa sains dan teknik.'
    )
ON CONFLICT (kode_buku) DO NOTHING;
