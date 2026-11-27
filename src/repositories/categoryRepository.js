const db = require('../config/db');
const { escapeLikePattern } = require('../utils/validation');

const findAll = async ({ search } = {}) => {
  const params = [];
  let whereClause = '';

  if (search) {
    params.push(`%${escapeLikePattern(search)}%`);
    whereClause = `WHERE k.nama_kategori ILIKE $1 ESCAPE '\\' OR COALESCE(k.deskripsi, '') ILIKE $1 ESCAPE '\\'`;
  }

  const sql = `
    SELECT
      k.id_kategori,
      k.nama_kategori,
      k.deskripsi,
      COUNT(b.id_buku) FILTER (WHERE b.is_active = TRUE)::INT AS jumlah_buku,
      k.created_at,
      k.updated_at
    FROM kategori k
    LEFT JOIN buku b ON b.id_kategori = k.id_kategori
    ${whereClause}
    GROUP BY k.id_kategori
    ORDER BY k.nama_kategori ASC
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

const findById = async (idKategori) => {
  const sql = `
    SELECT
      k.id_kategori,
      k.nama_kategori,
      k.deskripsi,
      COUNT(b.id_buku) FILTER (WHERE b.is_active = TRUE)::INT AS jumlah_buku,
      k.created_at,
      k.updated_at
    FROM kategori k
    LEFT JOIN buku b ON b.id_kategori = k.id_kategori
    WHERE k.id_kategori = $1
    GROUP BY k.id_kategori
    LIMIT 1
  `;
  const result = await db.query(sql, [idKategori]);
  return result.rows[0] || null;
};

const findByName = async (namaKategori, excludeId = null) => {
  if (excludeId !== null) {
    const sql = `
      SELECT id_kategori, nama_kategori
      FROM kategori
      WHERE LOWER(nama_kategori) = LOWER($1) AND id_kategori <> $2
      LIMIT 1
    `;
    const result = await db.query(sql, [namaKategori, excludeId]);
    return result.rows[0] || null;
  }

  const sql = `
    SELECT id_kategori, nama_kategori
    FROM kategori
    WHERE LOWER(nama_kategori) = LOWER($1)
    LIMIT 1
  `;
  const result = await db.query(sql, [namaKategori]);
  return result.rows[0] || null;
};

const countReferencedBooks = async (idKategori) => {
  const sql = `
    SELECT COUNT(*)::INT AS total
    FROM buku
    WHERE id_kategori = $1
  `;
  const result = await db.query(sql, [idKategori]);
  return result.rows[0].total;
};

const create = async ({ nama_kategori, deskripsi }) => {
  const sql = `
    INSERT INTO kategori (nama_kategori, deskripsi)
    VALUES ($1, $2)
    RETURNING id_kategori, nama_kategori, deskripsi, created_at, updated_at
  `;
  const result = await db.query(sql, [nama_kategori, deskripsi]);
  return { ...result.rows[0], jumlah_buku: 0 };
};

const update = async (idKategori, { nama_kategori, deskripsi }) => {
  const sql = `
    UPDATE kategori
    SET nama_kategori = $1, deskripsi = $2
    WHERE id_kategori = $3
    RETURNING id_kategori, nama_kategori, deskripsi, created_at, updated_at
  `;
  const result = await db.query(sql, [nama_kategori, deskripsi, idKategori]);
  return result.rows[0] || null;
};

const remove = async (idKategori) => {
  const sql = `
    DELETE FROM kategori
    WHERE id_kategori = $1
    RETURNING id_kategori, nama_kategori
  `;
  const result = await db.query(sql, [idKategori]);
  return result.rows[0] || null;
};

module.exports = {
  findAll,
  findById,
  findByName,
  countReferencedBooks,
  create,
  update,
  remove,
};
