const AppError = require('../utils/AppError');
const { FINE_STATUS, BUSINESS_RULES } = require('../constants/enums');
const { getTodayDateString } = require('./loanValidator');
const {
  MAX_NUMERIC_10_2,
  parseStrictInt,
  parseStrictNumber,
  parseStrictPositiveId,
} = require('../utils/validation');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const parseFineId = (rawId) => parseStrictPositiveId(rawId, 'ID denda');

const parseFineQuery = (query = {}) => {
  const rawSearch = query.q ?? query.search ?? '';
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null;

  let statusDenda = null;
  const rawStatus = query.status_denda ?? query.status;
  if (rawStatus !== undefined && rawStatus !== '') {
    const normalized = String(rawStatus).trim().toUpperCase();
    if (!Object.values(FINE_STATUS).includes(normalized)) {
      throw new AppError('Parameter status_denda harus BELUM_LUNAS atau LUNAS', 400);
    }
    statusDenda = normalized;
  }

  return { search, statusDenda };
};

const parseOptionalKeterangan = (value, errors) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    errors.push({ field: 'keterangan', message: 'Keterangan harus berupa teks' });
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const validateCreateFine = (body = {}) => {
  const errors = [];

  const idPeminjaman = parseStrictInt(body.id_peminjaman);
  if (body.id_peminjaman === undefined || body.id_peminjaman === null || body.id_peminjaman === '') {
    errors.push({ field: 'id_peminjaman', message: 'ID peminjaman wajib diisi' });
  } else if (idPeminjaman === null || idPeminjaman <= 0) {
    errors.push({ field: 'id_peminjaman', message: 'ID peminjaman tidak valid' });
  }

  const hariTerlambat = parseStrictInt(body.hari_terlambat);
  if (
    body.hari_terlambat === undefined ||
    body.hari_terlambat === null ||
    body.hari_terlambat === ''
  ) {
    errors.push({ field: 'hari_terlambat', message: 'Jumlah hari terlambat wajib diisi' });
  } else if (hariTerlambat === null || hariTerlambat < 0) {
    errors.push({
      field: 'hari_terlambat',
      message: 'Jumlah hari terlambat harus berupa bilangan bulat >= 0',
    });
  }

  let tarifPerHari = BUSINESS_RULES.DEFAULT_FINE_PER_DAY;
  if (
    body.tarif_per_hari !== undefined &&
    body.tarif_per_hari !== null &&
    body.tarif_per_hari !== ''
  ) {
    tarifPerHari = parseStrictNumber(body.tarif_per_hari);
    if (tarifPerHari === null || tarifPerHari < 0 || tarifPerHari > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'tarif_per_hari',
        message: `Tarif per hari harus berupa angka antara 0 dan ${MAX_NUMERIC_10_2}`,
      });
    }
  }

  let totalDenda = null;
  if (body.total_denda !== undefined && body.total_denda !== null && body.total_denda !== '') {
    totalDenda = parseStrictNumber(body.total_denda);
    if (totalDenda === null || totalDenda < 0 || totalDenda > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'total_denda',
        message: `Total denda harus berupa angka antara 0 dan ${MAX_NUMERIC_10_2}`,
      });
    }
  } else if (
    hariTerlambat !== null &&
    hariTerlambat >= 0 &&
    tarifPerHari !== null &&
    tarifPerHari >= 0
  ) {
    totalDenda = Number((hariTerlambat * tarifPerHari).toFixed(2));
    if (totalDenda > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'total_denda',
        message: `Hasil perhitungan total denda melebihi batas maksimal (${MAX_NUMERIC_10_2})`,
      });
    }
  }

  const keterangan = parseOptionalKeterangan(body.keterangan, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi data denda gagal', 400, errors);
  }

  return {
    id_peminjaman: idPeminjaman,
    hari_terlambat: hariTerlambat,
    tarif_per_hari: Number(tarifPerHari.toFixed(2)),
    total_denda: Number(totalDenda.toFixed(2)),
    status_denda: FINE_STATUS.BELUM_LUNAS,
    keterangan,
  };
};

const validateUpdateFine = (body = {}, existingFine) => {
  const errors = [];
  const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);

  let hariTerlambat = existingFine.hari_terlambat;
  if (hasField('hari_terlambat')) {
    hariTerlambat = parseStrictInt(body.hari_terlambat);
    if (hariTerlambat === null || hariTerlambat < 0) {
      errors.push({
        field: 'hari_terlambat',
        message: 'Jumlah hari terlambat harus berupa bilangan bulat >= 0',
      });
    }
  }

  let tarifPerHari = Number(existingFine.tarif_per_hari);
  if (hasField('tarif_per_hari')) {
    tarifPerHari = parseStrictNumber(body.tarif_per_hari);
    if (tarifPerHari === null || tarifPerHari < 0 || tarifPerHari > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'tarif_per_hari',
        message: `Tarif per hari harus berupa angka antara 0 dan ${MAX_NUMERIC_10_2}`,
      });
    }
  }

  let totalDenda = Number(existingFine.total_denda);
  if (hasField('total_denda')) {
    totalDenda = parseStrictNumber(body.total_denda);
    if (totalDenda === null || totalDenda < 0 || totalDenda > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'total_denda',
        message: `Total denda harus berupa angka antara 0 dan ${MAX_NUMERIC_10_2}`,
      });
    }
  } else if (
    (hasField('hari_terlambat') || hasField('tarif_per_hari')) &&
    hariTerlambat !== null &&
    hariTerlambat >= 0 &&
    tarifPerHari !== null &&
    tarifPerHari >= 0
  ) {
    totalDenda = Number((hariTerlambat * tarifPerHari).toFixed(2));
    if (totalDenda > MAX_NUMERIC_10_2) {
      errors.push({
        field: 'total_denda',
        message: `Hasil perhitungan total denda melebihi batas maksimal (${MAX_NUMERIC_10_2})`,
      });
    }
  }

  let statusDenda = existingFine.status_denda;
  if (hasField('status_denda')) {
    const normalized =
      typeof body.status_denda === 'string' ? body.status_denda.trim().toUpperCase() : '';
    if (!Object.values(FINE_STATUS).includes(normalized)) {
      errors.push({ field: 'status_denda', message: 'Status denda harus BELUM_LUNAS atau LUNAS' });
    } else {
      statusDenda = normalized;
    }
  }

  let tanggalBayar = existingFine.tanggal_bayar;
  if (hasField('tanggal_bayar')) {
    if (body.tanggal_bayar === null || body.tanggal_bayar === '') {
      tanggalBayar = null;
    } else if (!isValidDateString(body.tanggal_bayar)) {
      errors.push({ field: 'tanggal_bayar', message: 'Format tanggal_bayar harus YYYY-MM-DD' });
    } else {
      tanggalBayar = body.tanggal_bayar;
    }
  }

  if (statusDenda === FINE_STATUS.LUNAS && !tanggalBayar) {
    tanggalBayar = getTodayDateString();
  }
  if (statusDenda === FINE_STATUS.BELUM_LUNAS) {
    tanggalBayar = null;
  }

  const keterangan = hasField('keterangan')
    ? parseOptionalKeterangan(body.keterangan, errors)
    : existingFine.keterangan;

  if (errors.length > 0) {
    throw new AppError('Validasi pembaruan denda gagal', 400, errors);
  }

  return {
    hari_terlambat: hariTerlambat,
    tarif_per_hari: Number(tarifPerHari.toFixed(2)),
    total_denda: Number(totalDenda.toFixed(2)),
    status_denda: statusDenda,
    tanggal_bayar: tanggalBayar,
    keterangan,
  };
};

const validatePayFine = (body = {}) => {
  const errors = [];

  let tanggalBayar = getTodayDateString();
  if (
    body.tanggal_bayar !== undefined &&
    body.tanggal_bayar !== null &&
    body.tanggal_bayar !== ''
  ) {
    if (!isValidDateString(body.tanggal_bayar)) {
      errors.push({ field: 'tanggal_bayar', message: 'Format tanggal_bayar harus YYYY-MM-DD' });
    } else {
      tanggalBayar = body.tanggal_bayar;
    }
  }

  const keterangan = parseOptionalKeterangan(body.keterangan, errors);

  if (errors.length > 0) {
    throw new AppError('Validasi pelunasan denda gagal', 400, errors);
  }

  return { tanggal_bayar: tanggalBayar, keterangan };
};

module.exports = {
  parseFineId,
  parseFineQuery,
  validateCreateFine,
  validateUpdateFine,
  validatePayFine,
};
