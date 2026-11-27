const db = require('../config/db');

const findByIdentifier = async (identifier) => {
  const sql = `
    SELECT
      id_anggota,
      nim,
      nama_lengkap,
      email,
      password_hash,
      program_studi,
      no_telepon,
      role,
      status_akun,
      refresh_token_hash,
      created_at,
      updated_at
    FROM anggota
    WHERE LOWER(email) = LOWER($1) OR nim = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [identifier]);
  return result.rows[0] || null;
};

const findById = async (idAnggota) => {
  const sql = `
    SELECT
      id_anggota,
      nim,
      nama_lengkap,
      email,
      password_hash,
      program_studi,
      no_telepon,
      role,
      status_akun,
      refresh_token_hash,
      created_at,
      updated_at
    FROM anggota
    WHERE id_anggota = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idAnggota]);
  return result.rows[0] || null;
};

const updateRefreshTokenHash = async (idAnggota, refreshTokenHash) => {
  const sql = `
    UPDATE anggota
    SET refresh_token_hash = $1
    WHERE id_anggota = $2
    RETURNING id_anggota
  `;
  const result = await db.query(sql, [refreshTokenHash, idAnggota]);
  return result.rows[0] || null;
};

module.exports = {
  findByIdentifier,
  findById,
  updateRefreshTokenHash,
};
