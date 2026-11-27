const db = require('../config/db');
const { ROLES, ACCOUNT_STATUS, LOAN_STATUS, FINE_STATUS } = require('../constants/enums');

const getAdminSummary = async () => {
  const sql = `
    SELECT
      (SELECT COUNT(*)::INT FROM buku WHERE is_active = TRUE) AS total_buku_aktif,
      (SELECT COALESCE(SUM(stok_tersedia), 0)::INT FROM buku WHERE is_active = TRUE) AS total_eksemplar_tersedia,
      (SELECT COUNT(*)::INT FROM kategori) AS total_kategori,
      (SELECT COUNT(*)::INT FROM anggota WHERE role = $1 AND status_akun = $2) AS total_anggota_aktif,
      (SELECT COUNT(*)::INT FROM anggota WHERE role = $1 AND status_akun = $3) AS total_anggota_nonaktif,
      (SELECT COUNT(*)::INT FROM peminjaman WHERE status_peminjaman = $4) AS peminjaman_diajukan,
      (SELECT COUNT(*)::INT FROM peminjaman WHERE status_peminjaman = $5) AS peminjaman_dipinjam,
      (SELECT COUNT(*)::INT FROM peminjaman WHERE status_peminjaman = $6) AS peminjaman_terlambat,
      (SELECT COUNT(*)::INT FROM denda WHERE status_denda = $7) AS denda_belum_lunas_count,
      (SELECT COALESCE(SUM(total_denda), 0)::NUMERIC(12,2) FROM denda WHERE status_denda = $7) AS denda_belum_lunas_nominal
  `;

  const result = await db.query(sql, [
    ROLES.ANGGOTA,
    ACCOUNT_STATUS.AKTIF,
    ACCOUNT_STATUS.NONAKTIF,
    LOAN_STATUS.DIAJUKAN,
    LOAN_STATUS.DIPINJAM,
    LOAN_STATUS.TERLAMBAT,
    FINE_STATUS.BELUM_LUNAS,
  ]);

  const row = result.rows[0];
  return {
    ...row,
    denda_belum_lunas_nominal: Number(row.denda_belum_lunas_nominal),
  };
};

module.exports = {
  getAdminSummary,
};
