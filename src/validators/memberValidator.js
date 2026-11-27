const AppError = require('../utils/AppError');
const { ACCOUNT_STATUS, ROLES } = require('../constants/enums');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

const parseMemberId = (rawId) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('ID anggota tidak valid', 400);
  }
  return id;
};

const parseMemberQuery = (query = {}) => {
  const rawSearch = query.q ?? query.search ?? '';
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null;

  let statusAkun = null;
  if (query.status_akun !== undefined && query.status_akun !== '') {
    const normalized = String(query.status_akun).trim().toUpperCase();
    if (!Object.values(ACCOUNT_STATUS).includes(normalized)) {
      throw new AppError('Parameter status_akun harus AKTIF atau NONAKTIF', 400);
    }
    statusAkun = normalized;
  }

  return { search, statusAkun };
};

const parseOptionalString = (value, field, maxLen, errors) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.push({ field, message: `${field} harus berupa teks` });
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (maxLen && trimmed.length > maxLen) {
    errors.push({ field, message: `${field} maksimal ${maxLen} karakter` });
    return null;
  }
  return trimmed;
};

const validateCreateMember = (body = {}) => {
  const errors = [];

  const nim = typeof body.nim === 'string' ? body.nim.trim() : '';
  if (!nim) {
    errors.push({ field: 'nim', message: 'NIM wajib diisi' });
  } else if (nim.length > 20) {
    errors.push({ field: 'nim', message: 'NIM maksimal 20 karakter' });
  }

  const namaLengkap = typeof body.nama_lengkap === 'string' ? body.nama_lengkap.trim() : '';
  if (!namaLengkap) {
    errors.push({ field: 'nama_lengkap', message: 'Nama lengkap wajib diisi' });
  } else if (namaLengkap.length > 150) {
    errors.push({ field: 'nama_lengkap', message: 'Nama lengkap maksimal 150 karakter' });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) {
    errors.push({ field: 'email', message: 'Email wajib diisi' });
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push({ field: 'email', message: 'Format email tidak valid' });
  } else if (email.length > 150) {
    errors.push({ field: 'email', message: 'Email maksimal 150 karakter' });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password) {
    errors.push({ field: 'password', message: 'Kata sandi awal wajib diisi' });
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push({
      field: 'password',
      message: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`,
    });
  }

  const programStudi = parseOptionalString(body.program_studi, 'program_studi', 100, errors);
  const noTelepon = parseOptionalString(body.no_telepon, 'no_telepon', 20, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi data anggota gagal', 400, errors);
  }

  return {
    nim,
    nama_lengkap: namaLengkap,
    email,
    password,
    program_studi: programStudi,
    no_telepon: noTelepon,
  };
};

const validateUpdateMember = (body = {}, existingMember) => {
  const errors = [];
  const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);

  let nim = existingMember.nim;
  if (hasField('nim')) {
    const rawNim = typeof body.nim === 'string' ? body.nim.trim() : '';
    if (existingMember.role === ROLES.ANGGOTA && !rawNim) {
      errors.push({ field: 'nim', message: 'NIM wajib diisi untuk akun Anggota' });
    } else if (rawNim.length > 20) {
      errors.push({ field: 'nim', message: 'NIM maksimal 20 karakter' });
    } else {
      nim = rawNim || null;
    }
  }

  let namaLengkap = existingMember.nama_lengkap;
  if (hasField('nama_lengkap')) {
    namaLengkap = typeof body.nama_lengkap === 'string' ? body.nama_lengkap.trim() : '';
    if (!namaLengkap) {
      errors.push({ field: 'nama_lengkap', message: 'Nama lengkap wajib diisi' });
    } else if (namaLengkap.length > 150) {
      errors.push({ field: 'nama_lengkap', message: 'Nama lengkap maksimal 150 karakter' });
    }
  }

  let email = existingMember.email;
  if (hasField('email')) {
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      errors.push({ field: 'email', message: 'Email wajib diisi' });
    } else if (!EMAIL_REGEX.test(email)) {
      errors.push({ field: 'email', message: 'Format email tidak valid' });
    } else if (email.length > 150) {
      errors.push({ field: 'email', message: 'Email maksimal 150 karakter' });
    }
  }

  let password = null;
  if (hasField('password') && body.password !== undefined && body.password !== null && body.password !== '') {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD_LENGTH) {
      errors.push({
        field: 'password',
        message: `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`,
      });
    } else {
      password = body.password;
    }
  }

  const programStudi = hasField('program_studi')
    ? parseOptionalString(body.program_studi, 'program_studi', 100, errors)
    : existingMember.program_studi;

  const noTelepon = hasField('no_telepon')
    ? parseOptionalString(body.no_telepon, 'no_telepon', 20, errors)
    : existingMember.no_telepon;

  let statusAkun = existingMember.status_akun;
  if (hasField('status_akun')) {
    const normalized = typeof body.status_akun === 'string' ? body.status_akun.trim().toUpperCase() : '';
    if (!Object.values(ACCOUNT_STATUS).includes(normalized)) {
      errors.push({ field: 'status_akun', message: 'Status akun harus AKTIF atau NONAKTIF' });
    } else {
      statusAkun = normalized;
    }
  }

  if (errors.length > 0) {
    throw new AppError('Validasi pembaruan data anggota gagal', 400, errors);
  }

  return {
    nim,
    nama_lengkap: namaLengkap,
    email,
    password,
    program_studi: programStudi,
    no_telepon: noTelepon,
    status_akun: statusAkun,
  };
};

module.exports = {
  parseMemberId,
  parseMemberQuery,
  validateCreateMember,
  validateUpdateMember,
};
