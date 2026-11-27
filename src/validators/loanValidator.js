const AppError = require('../utils/AppError');
const { LOAN_STATUS, ROLES } = require('../constants/enums');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseLoanId = (rawId) => {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('ID peminjaman tidak valid', 400);
  }
  return id;
};

const isValidDateString = (dateStr) => {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

const getTodayDateString = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const addDaysToDateString = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
};

const diffDaysBetweenDates = (earlierDateStr, laterDateStr) => {
  const [y1, m1, d1] = earlierDateStr.split('-').map(Number);
  const [y2, m2, d2] = laterDateStr.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
};

const parseOptionalNote = (value, errors) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.push({ field: 'catatan', message: 'Catatan harus berupa teks' });
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseLoanQuery = (query = {}) => {
  const rawSearch = query.q ?? query.search ?? '';
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null;

  let statusPeminjaman = null;
  const rawStatus = query.status_peminjaman ?? query.status;
  if (rawStatus !== undefined && rawStatus !== '') {
    const normalized = String(rawStatus).trim().toUpperCase();
    if (!Object.values(LOAN_STATUS).includes(normalized)) {
      throw new AppError(
        `Parameter status_peminjaman harus salah satu dari: ${Object.values(LOAN_STATUS).join(', ')}`,
        400
      );
    }
    statusPeminjaman = normalized;
  }

  let idAnggota = null;
  if (query.id_anggota !== undefined && query.id_anggota !== '') {
    const parsed = Number(query.id_anggota);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError('Parameter id_anggota tidak valid', 400);
    }
    idAnggota = parsed;
  }

  let idBuku = null;
  if (query.id_buku !== undefined && query.id_buku !== '') {
    const parsed = Number(query.id_buku);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError('Parameter id_buku tidak valid', 400);
    }
    idBuku = parsed;
  }

  return { search, statusPeminjaman, idAnggota, idBuku };
};

const validateCreateLoan = (body = {}, userRole) => {
  const errors = [];

  const idBuku = Number(body.id_buku);
  if (body.id_buku === undefined || body.id_buku === null || body.id_buku === '') {
    errors.push({ field: 'id_buku', message: 'Buku wajib dipilih' });
  } else if (!Number.isInteger(idBuku) || idBuku <= 0) {
    errors.push({ field: 'id_buku', message: 'ID buku tidak valid' });
  }

  let jumlah = 1;
  if (body.jumlah !== undefined && body.jumlah !== null && body.jumlah !== '') {
    jumlah = Number(body.jumlah);
    if (!Number.isInteger(jumlah) || jumlah < 1) {
      errors.push({ field: 'jumlah', message: 'Jumlah pinjam minimal 1 eksemplar' });
    }
  }

  let idAnggota = null;
  let tanggalPinjam = null;
  let tanggalJatuhTempo = null;

  if (userRole === ROLES.ADMIN) {
    idAnggota = Number(body.id_anggota);
    if (body.id_anggota === undefined || body.id_anggota === null || body.id_anggota === '') {
      errors.push({ field: 'id_anggota', message: 'Anggota peminjam wajib dipilih' });
    } else if (!Number.isInteger(idAnggota) || idAnggota <= 0) {
      errors.push({ field: 'id_anggota', message: 'ID anggota tidak valid' });
    }

    if (body.tanggal_pinjam !== undefined && body.tanggal_pinjam !== null && body.tanggal_pinjam !== '') {
      if (!isValidDateString(body.tanggal_pinjam)) {
        errors.push({ field: 'tanggal_pinjam', message: 'Format tanggal_pinjam harus YYYY-MM-DD' });
      } else {
        tanggalPinjam = body.tanggal_pinjam;
      }
    }

    if (
      body.tanggal_jatuh_tempo !== undefined &&
      body.tanggal_jatuh_tempo !== null &&
      body.tanggal_jatuh_tempo !== ''
    ) {
      if (!isValidDateString(body.tanggal_jatuh_tempo)) {
        errors.push({
          field: 'tanggal_jatuh_tempo',
          message: 'Format tanggal_jatuh_tempo harus YYYY-MM-DD',
        });
      } else {
        tanggalJatuhTempo = body.tanggal_jatuh_tempo;
      }
    }
  }

  const catatan = parseOptionalNote(body.catatan, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi pengajuan/pencatatan peminjaman gagal', 400, errors);
  }

  return {
    id_anggota: idAnggota,
    id_buku: idBuku,
    jumlah,
    tanggal_pinjam: tanggalPinjam,
    tanggal_jatuh_tempo: tanggalJatuhTempo,
    catatan,
  };
};

const validateApproveLoan = (body = {}) => {
  const errors = [];

  let tanggalPinjam = null;
  if (body.tanggal_pinjam !== undefined && body.tanggal_pinjam !== null && body.tanggal_pinjam !== '') {
    if (!isValidDateString(body.tanggal_pinjam)) {
      errors.push({ field: 'tanggal_pinjam', message: 'Format tanggal_pinjam harus YYYY-MM-DD' });
    } else {
      tanggalPinjam = body.tanggal_pinjam;
    }
  }

  let tanggalJatuhTempo = null;
  if (
    body.tanggal_jatuh_tempo !== undefined &&
    body.tanggal_jatuh_tempo !== null &&
    body.tanggal_jatuh_tempo !== ''
  ) {
    if (!isValidDateString(body.tanggal_jatuh_tempo)) {
      errors.push({
        field: 'tanggal_jatuh_tempo',
        message: 'Format tanggal_jatuh_tempo harus YYYY-MM-DD',
      });
    } else {
      tanggalJatuhTempo = body.tanggal_jatuh_tempo;
    }
  }

  const catatan = parseOptionalNote(body.catatan, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi persetujuan peminjaman gagal', 400, errors);
  }

  return {
    tanggal_pinjam: tanggalPinjam,
    tanggal_jatuh_tempo: tanggalJatuhTempo,
    catatan,
  };
};

const validateRejectOrCancelLoan = (body = {}) => {
  const errors = [];
  const catatan = parseOptionalNote(body.catatan, errors);
  if (errors.length > 0) {
    throw new AppError('Validasi catatan gagal', 400, errors);
  }
  return { catatan };
};

const validateReturnLoan = (body = {}) => {
  const errors = [];

  let tanggalKembali = getTodayDateString();
  if (
    body.tanggal_kembali !== undefined &&
    body.tanggal_kembali !== null &&
    body.tanggal_kembali !== ''
  ) {
    if (!isValidDateString(body.tanggal_kembali)) {
      errors.push({
        field: 'tanggal_kembali',
        message: 'Format tanggal_kembali harus YYYY-MM-DD',
      });
    } else {
      tanggalKembali = body.tanggal_kembali;
    }
  }

  const catatan = parseOptionalNote(body.catatan, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi pengembalian buku gagal', 400, errors);
  }

  return {
    tanggal_kembali: tanggalKembali,
    catatan,
  };
};

module.exports = {
  parseLoanId,
  parseLoanQuery,
  validateCreateLoan,
  validateApproveLoan,
  validateRejectOrCancelLoan,
  validateReturnLoan,
  getTodayDateString,
  addDaysToDateString,
  diffDaysBetweenDates,
};
