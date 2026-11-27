const db = require('../config/db');

const FINE_SELECT_FIELDS = `
  d.id_denda,
  d.id_peminjaman,
  p.kode_peminjaman,
  p.id_anggota,
  a.nim AS anggota_nim,
  a.nama_lengkap AS anggota_nama,
  a.email AS anggota_email,
  a.program_studi AS anggota_program_studi,
  p.id_buku,
  b.kode_buku AS buku_kode,
  b.judul AS buku_judul,
  TO_CHAR(p.tanggal_pinjam, 'YYYY-MM-DD') AS tanggal_pinjam,
  TO_CHAR(p.tanggal_jatuh_tempo, 'YYYY-MM-DD') AS tanggal_jatuh_tempo,
  TO_CHAR(p.tanggal_kembali, 'YYYY-MM-DD') AS tanggal_kembali,
  p.status_peminjaman,
  d.hari_terlambat,
  d.tarif_per_hari,
  d.total_denda,
  d.status_denda,
  TO_CHAR(d.tanggal_bayar, 'YYYY-MM-DD') AS tanggal_bayar,
  d.keterangan,
  d.created_at,
  d.updated_at
`;

const findAll = async ({
  search = null,
  statusDenda = null,
  idAnggota = null,
  isAdmin = false,
} = {}) => {
  const conditions = [];
  const params = [];

  if (idAnggota !== null) {
    params.push(idAnggota);
    conditions.push(`p.id_anggota = $${params.length}`);
  }

  if (statusDenda) {
    params.push(statusDenda);
    conditions.push(`d.status_denda = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const idx = params.length;
    if (isAdmin) {
      conditions.push(
        `(p.kode_peminjaman ILIKE $${idx} OR b.judul ILIKE $${idx} OR COALESCE(a.nim, '') ILIKE $${idx} OR a.nama_lengkap ILIKE $${idx})`
      );
    } else {
      conditions.push(`(p.kode_peminjaman ILIKE $${idx} OR b.judul ILIKE $${idx})`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT ${FINE_SELECT_FIELDS}
    FROM denda d
    INNER JOIN peminjaman p ON p.id_peminjaman = d.id_peminjaman
    INNER JOIN anggota a ON a.id_anggota = p.id_anggota
    INNER JOIN buku b ON b.id_buku = p.id_buku
    ${whereClause}
    ORDER BY d.created_at DESC, d.id_denda DESC
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

const findById = async (idDenda) => {
  const sql = `
    SELECT ${FINE_SELECT_FIELDS}
    FROM denda d
    INNER JOIN peminjaman p ON p.id_peminjaman = d.id_peminjaman
    INNER JOIN anggota a ON a.id_anggota = p.id_anggota
    INNER JOIN buku b ON b.id_buku = p.id_buku
    WHERE d.id_denda = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idDenda]);
  return result.rows[0] || null;
};

const findByLoanId = async (idPeminjaman) => {
  const sql = `
    SELECT id_denda, id_peminjaman
    FROM denda
    WHERE id_peminjaman = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idPeminjaman]);
  return result.rows[0] || null;
};

const findLoanExists = async (idPeminjaman) => {
  const sql = `
    SELECT id_peminjaman, kode_peminjaman, status_peminjaman
    FROM peminjaman
    WHERE id_peminjaman = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idPeminjaman]);
  return result.rows[0] || null;
};

const create = async (data) => {
  const sql = `
    INSERT INTO denda (
      id_peminjaman,
      hari_terlambat,
      tarif_per_hari,
      total_denda,
      status_denda,
      keterangan
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id_denda
  `;
  const params = [
    data.id_peminjaman,
    data.hari_terlambat,
    data.tarif_per_hari,
    data.total_denda,
    data.status_denda,
    data.keterangan,
  ];
  const result = await db.query(sql, params);
  return findById(result.rows[0].id_denda);
};

const update = async (idDenda, data) => {
  const sql = `
    UPDATE denda
    SET
      hari_terlambat = $1,
      tarif_per_hari = $2,
      total_denda = $3,
      status_denda = $4,
      tanggal_bayar = $5,
      keterangan = $6
    WHERE id_denda = $7
    RETURNING id_denda
  `;
  const params = [
    data.hari_terlambat,
    data.tarif_per_hari,
    data.total_denda,
    data.status_denda,
    data.tanggal_bayar,
    data.keterangan,
    idDenda,
  ];
  const result = await db.query(sql, params);
  if (result.rows.length === 0) return null;
  return findById(result.rows[0].id_denda);
};

const remove = async (idDenda) => {
  const sql = `
    DELETE FROM denda
    WHERE id_denda = $1
    RETURNING id_denda, id_peminjaman, total_denda, status_denda
  `;
  const result = await db.query(sql, [idDenda]);
  return result.rows[0] || null;
};

module.exports = {
  findAll,
  findById,
  findByLoanId,
  findLoanExists,
  create,
  update,
  remove,
};
