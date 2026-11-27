const db = require('../config/db');
const { LOAN_STATUS } = require('../constants/enums');

const LOAN_SELECT_FIELDS = `
  p.id_peminjaman,
  p.kode_peminjaman,
  p.id_anggota,
  a.nim AS anggota_nim,
  a.nama_lengkap AS anggota_nama,
  a.email AS anggota_email,
  a.program_studi AS anggota_program_studi,
  p.id_buku,
  b.kode_buku AS buku_kode,
  b.judul AS buku_judul,
  b.penulis AS buku_penulis,
  b.lokasi_rak AS buku_lokasi_rak,
  p.jumlah,
  TO_CHAR(p.tanggal_pengajuan, 'YYYY-MM-DD') AS tanggal_pengajuan,
  TO_CHAR(p.tanggal_pinjam, 'YYYY-MM-DD') AS tanggal_pinjam,
  TO_CHAR(p.tanggal_jatuh_tempo, 'YYYY-MM-DD') AS tanggal_jatuh_tempo,
  TO_CHAR(p.tanggal_kembali, 'YYYY-MM-DD') AS tanggal_kembali,
  p.status_peminjaman,
  p.catatan,
  d.id_denda,
  d.hari_terlambat,
  d.tarif_per_hari,
  d.total_denda,
  d.status_denda,
  TO_CHAR(d.tanggal_bayar, 'YYYY-MM-DD') AS tanggal_bayar_denda,
  p.created_at,
  p.updated_at
`;

const syncOverdueLoans = async (client = db) => {
  const sql = `
    UPDATE peminjaman
    SET status_peminjaman = $1
    WHERE status_peminjaman = $2
      AND tanggal_jatuh_tempo IS NOT NULL
      AND tanggal_jatuh_tempo < CURRENT_DATE
  `;
  await client.query(sql, [LOAN_STATUS.TERLAMBAT, LOAN_STATUS.DIPINJAM]);
};

const findAll = async ({
  search = null,
  statusPeminjaman = null,
  idAnggota = null,
  idBuku = null,
  isAdmin = false,
} = {}) => {
  const conditions = [];
  const params = [];

  if (idAnggota !== null) {
    params.push(idAnggota);
    conditions.push(`p.id_anggota = $${params.length}`);
  }

  if (idBuku !== null) {
    params.push(idBuku);
    conditions.push(`p.id_buku = $${params.length}`);
  }

  if (statusPeminjaman) {
    params.push(statusPeminjaman);
    conditions.push(`p.status_peminjaman = $${params.length}`);
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
    SELECT ${LOAN_SELECT_FIELDS}
    FROM peminjaman p
    INNER JOIN anggota a ON a.id_anggota = p.id_anggota
    INNER JOIN buku b ON b.id_buku = p.id_buku
    LEFT JOIN denda d ON d.id_peminjaman = p.id_peminjaman
    ${whereClause}
    ORDER BY p.created_at DESC, p.id_peminjaman DESC
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

const findById = async (idPeminjaman, client = db) => {
  const sql = `
    SELECT ${LOAN_SELECT_FIELDS}
    FROM peminjaman p
    INNER JOIN anggota a ON a.id_anggota = p.id_anggota
    INNER JOIN buku b ON b.id_buku = p.id_buku
    LEFT JOIN denda d ON d.id_peminjaman = p.id_peminjaman
    WHERE p.id_peminjaman = $1
    LIMIT 1
  `;
  const result = await client.query(sql, [idPeminjaman]);
  return result.rows[0] || null;
};

const findRawForUpdate = async (idPeminjaman, client) => {
  const sql = `
    SELECT
      id_peminjaman,
      kode_peminjaman,
      id_anggota,
      id_buku,
      jumlah,
      TO_CHAR(tanggal_pengajuan, 'YYYY-MM-DD') AS tanggal_pengajuan,
      TO_CHAR(tanggal_pinjam, 'YYYY-MM-DD') AS tanggal_pinjam,
      TO_CHAR(tanggal_jatuh_tempo, 'YYYY-MM-DD') AS tanggal_jatuh_tempo,
      TO_CHAR(tanggal_kembali, 'YYYY-MM-DD') AS tanggal_kembali,
      status_peminjaman,
      catatan
    FROM peminjaman
    WHERE id_peminjaman = $1
    FOR UPDATE
  `;
  const result = await client.query(sql, [idPeminjaman]);
  return result.rows[0] || null;
};

const lockBookForUpdate = async (idBuku, client) => {
  const sql = `
    SELECT id_buku, judul, stok_total, stok_tersedia, is_active
    FROM buku
    WHERE id_buku = $1
    FOR UPDATE
  `;
  const result = await client.query(sql, [idBuku]);
  return result.rows[0] || null;
};

const findMemberBasic = async (idAnggota, client = db) => {
  const sql = `
    SELECT id_anggota, nim, nama_lengkap, role, status_akun
    FROM anggota
    WHERE id_anggota = $1
    LIMIT 1
  `;
  const result = await client.query(sql, [idAnggota]);
  return result.rows[0] || null;
};

const adjustBookStock = async (idBuku, delta, client) => {
  const sql = `
    UPDATE buku
    SET stok_tersedia = stok_tersedia + $1
    WHERE id_buku = $2
    RETURNING id_buku, stok_total, stok_tersedia
  `;
  const result = await client.query(sql, [delta, idBuku]);
  return result.rows[0];
};

const createLoan = async (data, client = db) => {
  const sql = `
    INSERT INTO peminjaman (
      kode_peminjaman,
      id_anggota,
      id_buku,
      jumlah,
      tanggal_pengajuan,
      tanggal_pinjam,
      tanggal_jatuh_tempo,
      status_peminjaman,
      catatan
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id_peminjaman
  `;
  const params = [
    data.kode_peminjaman,
    data.id_anggota,
    data.id_buku,
    data.jumlah,
    data.tanggal_pengajuan,
    data.tanggal_pinjam,
    data.tanggal_jatuh_tempo,
    data.status_peminjaman,
    data.catatan,
  ];
  const result = await client.query(sql, params);
  return result.rows[0].id_peminjaman;
};

const updateLoanStatus = async (idPeminjaman, updates, client = db) => {
  const fields = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      params.push(value);
      fields.push(`${key} = $${params.length}`);
    }
  }

  params.push(idPeminjaman);
  const sql = `
    UPDATE peminjaman
    SET ${fields.join(', ')}
    WHERE id_peminjaman = $${params.length}
    RETURNING id_peminjaman
  `;
  const result = await client.query(sql, params);
  return result.rows[0] || null;
};

const createAutoFine = async (data, client) => {
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
  const result = await client.query(sql, params);
  return result.rows[0];
};

const hasAssociatedFine = async (idPeminjaman, client = db) => {
  const sql = `
    SELECT COUNT(*)::INT AS total
    FROM denda
    WHERE id_peminjaman = $1
  `;
  const result = await client.query(sql, [idPeminjaman]);
  return result.rows[0].total > 0;
};

const removeLoan = async (idPeminjaman, client = db) => {
  const sql = `
    DELETE FROM peminjaman
    WHERE id_peminjaman = $1
    RETURNING id_peminjaman, kode_peminjaman, status_peminjaman
  `;
  const result = await client.query(sql, [idPeminjaman]);
  return result.rows[0] || null;
};

module.exports = {
  syncOverdueLoans,
  findAll,
  findById,
  findRawForUpdate,
  lockBookForUpdate,
  findMemberBasic,
  adjustBookStock,
  createLoan,
  updateLoanStatus,
  createAutoFine,
  hasAssociatedFine,
  removeLoan,
};
