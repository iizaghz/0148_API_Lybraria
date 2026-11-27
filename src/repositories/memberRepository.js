const db = require('../config/db');
const { ROLES, ACCOUNT_STATUS, LOAN_STATUS, FINE_STATUS } = require('../constants/enums');
const { escapeLikePattern } = require('../utils/validation');

// FR-27: Tidak pernah men-SELECT password_hash atau refresh_token_hash
const SAFE_MEMBER_FIELDS = `
  a.id_anggota,
  a.nim,
  a.nama_lengkap,
  a.email,
  a.program_studi,
  a.no_telepon,
  a.role,
  a.status_akun,
  a.created_at,
  a.updated_at,
  (
    SELECT COUNT(*)::INT
    FROM peminjaman p
    WHERE p.id_anggota = a.id_anggota
      AND p.status_peminjaman IN ('${LOAN_STATUS.DIAJUKAN}', '${LOAN_STATUS.DIPINJAM}', '${LOAN_STATUS.TERLAMBAT}')
  ) AS jumlah_peminjaman_aktif,
  (
    SELECT COUNT(*)::INT
    FROM denda d
    INNER JOIN peminjaman p ON p.id_peminjaman = d.id_peminjaman
    WHERE p.id_anggota = a.id_anggota
      AND d.status_denda = '${FINE_STATUS.BELUM_LUNAS}'
  ) AS jumlah_denda_belum_lunas
`;

const findAllMembers = async ({ search = null, statusAkun = null } = {}) => {
  const conditions = [`a.role = $1`];
  const params = [ROLES.ANGGOTA];

  if (statusAkun) {
    params.push(statusAkun);
    conditions.push(`a.status_akun = $${params.length}`);
  }

  if (search) {
    params.push(`%${escapeLikePattern(search)}%`);
    const idx = params.length;
    conditions.push(
      `(COALESCE(a.nim, '') ILIKE $${idx} ESCAPE '\\' OR a.nama_lengkap ILIKE $${idx} ESCAPE '\\' OR a.email ILIKE $${idx} ESCAPE '\\' OR COALESCE(a.program_studi, '') ILIKE $${idx} ESCAPE '\\')`
    );
  }

  const sql = `
    SELECT ${SAFE_MEMBER_FIELDS}
    FROM anggota a
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.nama_lengkap ASC, a.id_anggota ASC
  `;

  const result = await db.query(sql, params);
  return result.rows;
};

const findById = async (idAnggota) => {
  const sql = `
    SELECT ${SAFE_MEMBER_FIELDS}
    FROM anggota a
    WHERE a.id_anggota = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [idAnggota]);
  return result.rows[0] || null;
};

const findByNim = async (nim, excludeId = null) => {
  if (!nim) return null;

  if (excludeId !== null) {
    const sql = `
      SELECT id_anggota, nim
      FROM anggota
      WHERE nim = $1 AND id_anggota <> $2
      LIMIT 1
    `;
    const result = await db.query(sql, [nim, excludeId]);
    return result.rows[0] || null;
  }

  const sql = `
    SELECT id_anggota, nim
    FROM anggota
    WHERE nim = $1
    LIMIT 1
  `;
  const result = await db.query(sql, [nim]);
  return result.rows[0] || null;
};

const findByEmail = async (email, excludeId = null) => {
  if (excludeId !== null) {
    const sql = `
      SELECT id_anggota, email
      FROM anggota
      WHERE LOWER(email) = LOWER($1) AND id_anggota <> $2
      LIMIT 1
    `;
    const result = await db.query(sql, [email, excludeId]);
    return result.rows[0] || null;
  }

  const sql = `
    SELECT id_anggota, email
    FROM anggota
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
  `;
  const result = await db.query(sql, [email]);
  return result.rows[0] || null;
};

const countActiveObligations = async (idAnggota) => {
  const sql = `
    SELECT
      (
        SELECT COUNT(*)::INT
        FROM peminjaman p
        WHERE p.id_anggota = $1
          AND p.status_peminjaman IN ($2, $3, $4)
      ) AS peminjaman_aktif,
      (
        SELECT COUNT(*)::INT
        FROM denda d
        INNER JOIN peminjaman p ON p.id_peminjaman = d.id_peminjaman
        WHERE p.id_anggota = $1
          AND d.status_denda = $5
      ) AS denda_belum_lunas
  `;
  const result = await db.query(sql, [
    idAnggota,
    LOAN_STATUS.DIAJUKAN,
    LOAN_STATUS.DIPINJAM,
    LOAN_STATUS.TERLAMBAT,
    FINE_STATUS.BELUM_LUNAS,
  ]);
  return result.rows[0];
};

const createMember = async (data) => {
  const sql = `
    INSERT INTO anggota (
      nim,
      nama_lengkap,
      email,
      password_hash,
      program_studi,
      no_telepon,
      role,
      status_akun
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id_anggota
  `;
  const params = [
    data.nim,
    data.nama_lengkap,
    data.email,
    data.password_hash,
    data.program_studi,
    data.no_telepon,
    ROLES.ANGGOTA,
    ACCOUNT_STATUS.AKTIF,
  ];
  const result = await db.query(sql, params);
  return findById(result.rows[0].id_anggota);
};

const updateMember = async (idAnggota, data) => {
  const setClauses = [
    'nim = $1',
    'nama_lengkap = $2',
    'email = $3',
    'program_studi = $4',
    'no_telepon = $5',
    'status_akun = $6',
  ];
  const params = [
    data.nim,
    data.nama_lengkap,
    data.email,
    data.program_studi,
    data.no_telepon,
    data.status_akun,
  ];

  if (data.password_hash) {
    params.push(data.password_hash);
    setClauses.push(`password_hash = $${params.length}`);
  }

  // Revokasi sesi lama saat akun dinonaktifkan atau kata sandi direset
  if (data.status_akun === ACCOUNT_STATUS.NONAKTIF || data.password_hash) {
    setClauses.push('refresh_token_hash = NULL');
  }

  params.push(idAnggota);
  const sql = `
    UPDATE anggota
    SET ${setClauses.join(', ')}
    WHERE id_anggota = $${params.length}
    RETURNING id_anggota
  `;
  const result = await db.query(sql, params);
  if (result.rows.length === 0) return null;
  return findById(result.rows[0].id_anggota);
};

const deactivateMember = async (idAnggota) => {
  const sql = `
    UPDATE anggota
    SET status_akun = $1, refresh_token_hash = NULL
    WHERE id_anggota = $2
    RETURNING id_anggota
  `;
  const result = await db.query(sql, [ACCOUNT_STATUS.NONAKTIF, idAnggota]);
  if (result.rows.length === 0) return null;
  return findById(result.rows[0].id_anggota);
};

module.exports = {
  findAllMembers,
  findById,
  findByNim,
  findByEmail,
  countActiveObligations,
  createMember,
  updateMember,
  deactivateMember,
};
