const db = require('../config/db');
const { LOAN_STATUS } = require('../constants/enums');

const BOOK_SELECT_FIELDS = `
  b.id_buku,
  b.id_kategori,
  k.nama_kategori,
  b.kode_buku,
  b.isbn,
  b.judul,
  b.penulis,
  b.penerbit,
  b.tahun_terbit,
  b.stok_total,
  b.stok_tersedia,
  b.lokasi_rak,
  b.deskripsi,
  b.is_active,
  b.created_at,
  b.updated_at
`;

const findAll = async ({
  search = null,
  idKategori = null,
  includeInactive = false,
  availableOnly = false,
} = {}) => {
  const conditions = [];
  const params = [];

  if (!includeInactive) {
    conditions.push('b.is_active = TRUE');
  }

  if (idKategori !== null) {
    params.push(idKategori);
    conditions.push(`b.id_kategori = $${params.length}`);
  }

  if (availableOnly) {
    conditions.push('b.stok_tersedia > 0');
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    conditions.push(
      `(b.judul ILIKE $${idx} OR b.penulis ILIKE $${idx} OR b.kode_buku ILIKE $${idx} OR COALESCE(b.isbn, '') ILIKE $${idx})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT ${BOOK_SELECT_FIELDS}
    FROM buku b
    INNER JOIN kategori k ON k.id_kategori = b.id_kategori
    ${whereClause}
    ORDER BY b.judul ASC, b.id_buku ASC
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

const findById = async (idBuku) => {
  const sql = `
    SELECT ${BOOK_SELECT_FIELDS}
    FROM buku b
    INNER JOIN kategori k ON k.id_kategori = b.id_kategori
    WHERE b.id_buku = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idBuku]);
  return result.rows[0] || null;
};

const findByKodeBuku = async (kodeBuku, excludeId = null) => {
  if (excludeId !== null) {
    const sql = `
      SELECT id_buku, kode_buku
      FROM buku
      WHERE LOWER(kode_buku) = LOWER($1) AND id_buku <> $2
      LIMIT 1
    `;
    const result = await db.query(sql, [kodeBuku, excludeId]);
    return result.rows[0] || null;
  }

  const sql = `
    SELECT id_buku, kode_buku
    FROM buku
    WHERE LOWER(kode_buku) = LOWER($1)
    LIMIT 1
  `;
  const result = await db.query(sql, [kodeBuku]);
  return result.rows[0] || null;
};

const findByIsbn = async (isbn, excludeId = null) => {
  if (!isbn) return null;

  if (excludeId !== null) {
    const sql = `
      SELECT id_buku, isbn
      FROM buku
      WHERE LOWER(isbn) = LOWER($1) AND id_buku <> $2
      LIMIT 1
    `;
    const result = await db.query(sql, [isbn, excludeId]);
    return result.rows[0] || null;
  }

  const sql = `
    SELECT id_buku, isbn
    FROM buku
    WHERE LOWER(isbn) = LOWER($1)
    LIMIT 1
  `;
  const result = await db.query(sql, [isbn]);
  return result.rows[0] || null;
};

const getBorrowedCopiesCount = async (idBuku) => {
  const sql = `
    SELECT COALESCE(SUM(jumlah), 0)::INT AS total_dipinjam
    FROM peminjaman
    WHERE id_buku = $1
      AND status_peminjaman IN ($2, $3)
  `;
  const result = await db.query(sql, [
    idBuku,
    LOAN_STATUS.DIPINJAM,
    LOAN_STATUS.TERLAMBAT,
  ]);
  return result.rows[0].total_dipinjam;
};

const countActiveLoans = async (idBuku) => {
  const sql = `
    SELECT COUNT(*)::INT AS total_aktif
    FROM peminjaman
    WHERE id_buku = $1
      AND status_peminjaman IN ($2, $3, $4)
  `;
  const result = await db.query(sql, [
    idBuku,
    LOAN_STATUS.DIAJUKAN,
    LOAN_STATUS.DIPINJAM,
    LOAN_STATUS.TERLAMBAT,
  ]);
  return result.rows[0].total_aktif;
};

const create = async (data) => {
  const sql = `
    INSERT INTO buku (
      id_kategori,
      kode_buku,
      isbn,
      judul,
      penulis,
      penerbit,
      tahun_terbit,
      stok_total,
      stok_tersedia,
      lokasi_rak,
      deskripsi
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id_buku
  `;
  const params = [
    data.id_kategori,
    data.kode_buku,
    data.isbn,
    data.judul,
    data.penulis,
    data.penerbit,
    data.tahun_terbit,
    data.stok_total,
    data.stok_tersedia,
    data.lokasi_rak,
    data.deskripsi,
  ];
  const result = await db.query(sql, params);
  return findById(result.rows[0].id_buku);
};

const update = async (idBuku, data) => {
  const sql = `
    UPDATE buku
    SET
      id_kategori = $1,
      kode_buku = $2,
      isbn = $3,
      judul = $4,
      penulis = $5,
      penerbit = $6,
      tahun_terbit = $7,
      stok_total = $8,
      stok_tersedia = $9,
      lokasi_rak = $10,
      deskripsi = $11
    WHERE id_buku = $12
    RETURNING id_buku
  `;
  const params = [
    data.id_kategori,
    data.kode_buku,
    data.isbn,
    data.judul,
    data.penulis,
    data.penerbit,
    data.tahun_terbit,
    data.stok_total,
    data.stok_tersedia,
    data.lokasi_rak,
    data.deskripsi,
    idBuku,
  ];
  const result = await db.query(sql, params);
  if (result.rows.length === 0) return null;
  return findById(result.rows[0].id_buku);
};

const softDelete = async (idBuku) => {
  const sql = `
    UPDATE buku
    SET is_active = FALSE
    WHERE id_buku = $1
    RETURNING id_buku, kode_buku, judul, is_active, updated_at
  `;
  const result = await db.query(sql, [idBuku]);
  return result.rows[0] || null;
};

module.exports = {
  findAll,
  findById,
  findByKodeBuku,
  findByIsbn,
  getBorrowedCopiesCount,
  countActiveLoans,
  create,
  update,
  softDelete,
};
