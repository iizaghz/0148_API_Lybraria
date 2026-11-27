const AppError = require('../utils/AppError');
const { parseStrictInt, parseStrictPositiveId } = require('../utils/validation');

const parseBookId = (rawId) => parseStrictPositiveId(rawId, 'ID buku');

const parseBookQuery = (query = {}) => {
  const rawSearch = query.q ?? query.search ?? '';
  const search = typeof rawSearch === 'string' && rawSearch.trim() ? rawSearch.trim() : null;

  let idKategori = null;
  const rawCategory = query.id_kategori ?? query.category_id;
  if (rawCategory !== undefined && rawCategory !== '') {
    idKategori = parseStrictPositiveId(rawCategory, 'Parameter id_kategori');
  }

  const includeInactive = query.include_inactive === 'true';
  const availableOnly = query.available_only === 'true';

  return {
    search,
    idKategori,
    includeInactive,
    availableOnly,
  };
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

const parseRequiredString = (value, field, label, maxLen, errors) => {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) {
    errors.push({ field, message: `${label} wajib diisi` });
    return '';
  }
  if (maxLen && str.length > maxLen) {
    errors.push({ field, message: `${label} maksimal ${maxLen} karakter` });
  }
  return str;
};

const validateCreateBook = (body = {}) => {
  const errors = [];

  const kodeBuku = parseRequiredString(body.kode_buku, 'kode_buku', 'Kode buku', 30, errors);
  const judul = parseRequiredString(body.judul, 'judul', 'Judul buku', 200, errors);
  const penulis = parseRequiredString(body.penulis, 'penulis', 'Penulis', 150, errors);
  const penerbit = parseRequiredString(body.penerbit, 'penerbit', 'Penerbit', 150, errors);

  const isbn = parseOptionalString(body.isbn, 'isbn', 20, errors);
  const lokasiRak = parseOptionalString(body.lokasi_rak, 'lokasi_rak', 50, errors);
  const deskripsi = parseOptionalString(body.deskripsi, 'deskripsi', null, errors);

  const idKategori = parseStrictInt(body.id_kategori);
  if (body.id_kategori === undefined || body.id_kategori === null || body.id_kategori === '') {
    errors.push({ field: 'id_kategori', message: 'Kategori wajib dipilih' });
  } else if (idKategori === null || idKategori <= 0) {
    errors.push({ field: 'id_kategori', message: 'ID kategori tidak valid' });
  }

  const tahunTerbit = parseStrictInt(body.tahun_terbit);
  if (body.tahun_terbit === undefined || body.tahun_terbit === null || body.tahun_terbit === '') {
    errors.push({ field: 'tahun_terbit', message: 'Tahun terbit wajib diisi' });
  } else if (tahunTerbit === null || tahunTerbit < 1000 || tahunTerbit > 9999) {
    errors.push({ field: 'tahun_terbit', message: 'Tahun terbit harus berupa angka 4 digit' });
  }

  const stokTotal = parseStrictInt(body.stok_total);
  if (body.stok_total === undefined || body.stok_total === null || body.stok_total === '') {
    errors.push({ field: 'stok_total', message: 'Stok total wajib diisi' });
  } else if (stokTotal === null || stokTotal < 0) {
    errors.push({ field: 'stok_total', message: 'Stok total harus berupa bilangan bulat >= 0' });
  }

  // FR-09 Stimulus 1 & FR-10: default stok_tersedia = stok_total; jika dikirim manual tetap divalidasi
  let stokTersedia = stokTotal;
  if (body.stok_tersedia !== undefined && body.stok_tersedia !== null && body.stok_tersedia !== '') {
    stokTersedia = parseStrictInt(body.stok_tersedia);
    if (stokTersedia === null || stokTersedia < 0) {
      errors.push({
        field: 'stok_tersedia',
        message: 'Stok tersedia harus berupa bilangan bulat >= 0',
      });
    } else if (stokTotal !== null && stokTotal >= 0 && stokTersedia > stokTotal) {
      errors.push({
        field: 'stok_tersedia',
        message: 'Stok tersedia tidak boleh melebihi stok total',
      });
    }
  }

  if (errors.length > 0) {
    throw new AppError('Validasi data buku gagal', 400, errors);
  }

  return {
    id_kategori: idKategori,
    kode_buku: kodeBuku,
    isbn,
    judul,
    penulis,
    penerbit,
    tahun_terbit: tahunTerbit,
    stok_total: stokTotal,
    stok_tersedia: stokTersedia,
    lokasi_rak: lokasiRak,
    deskripsi,
  };
};

const validateUpdateBook = (body = {}, existingBook) => {
  const errors = [];

  const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const kodeBuku = hasField('kode_buku')
    ? parseRequiredString(body.kode_buku, 'kode_buku', 'Kode buku', 30, errors)
    : existingBook.kode_buku;

  const judul = hasField('judul')
    ? parseRequiredString(body.judul, 'judul', 'Judul buku', 200, errors)
    : existingBook.judul;

  const penulis = hasField('penulis')
    ? parseRequiredString(body.penulis, 'penulis', 'Penulis', 150, errors)
    : existingBook.penulis;

  const penerbit = hasField('penerbit')
    ? parseRequiredString(body.penerbit, 'penerbit', 'Penerbit', 150, errors)
    : existingBook.penerbit;

  const isbn = hasField('isbn')
    ? parseOptionalString(body.isbn, 'isbn', 20, errors)
    : existingBook.isbn;

  const lokasiRak = hasField('lokasi_rak')
    ? parseOptionalString(body.lokasi_rak, 'lokasi_rak', 50, errors)
    : existingBook.lokasi_rak;

  const deskripsi = hasField('deskripsi')
    ? parseOptionalString(body.deskripsi, 'deskripsi', null, errors)
    : existingBook.deskripsi;

  let idKategori = existingBook.id_kategori;
  if (hasField('id_kategori')) {
    idKategori = parseStrictInt(body.id_kategori);
    if (idKategori === null || idKategori <= 0) {
      errors.push({ field: 'id_kategori', message: 'ID kategori tidak valid' });
    }
  }

  let tahunTerbit = existingBook.tahun_terbit;
  if (hasField('tahun_terbit')) {
    tahunTerbit = parseStrictInt(body.tahun_terbit);
    if (tahunTerbit === null || tahunTerbit < 1000 || tahunTerbit > 9999) {
      errors.push({ field: 'tahun_terbit', message: 'Tahun terbit harus berupa angka 4 digit' });
    }
  }

  let stokTotal = existingBook.stok_total;
  if (hasField('stok_total')) {
    stokTotal = parseStrictInt(body.stok_total);
    if (stokTotal === null || stokTotal < 0) {
      errors.push({ field: 'stok_total', message: 'Stok total harus berupa bilangan bulat >= 0' });
    }
  }

  let hasExplicitStokTersedia = false;
  let stokTersedia = existingBook.stok_tersedia;
  if (hasField('stok_tersedia')) {
    hasExplicitStokTersedia = true;
    stokTersedia = parseStrictInt(body.stok_tersedia);
    if (stokTersedia === null || stokTersedia < 0) {
      errors.push({
        field: 'stok_tersedia',
        message: 'Stok tersedia harus berupa bilangan bulat >= 0',
      });
    } else if (stokTotal !== null && stokTotal >= 0 && stokTersedia > stokTotal) {
      errors.push({
        field: 'stok_tersedia',
        message: 'Stok tersedia tidak boleh melebihi stok total',
      });
    }
  }

  if (errors.length > 0) {
    throw new AppError('Validasi pembaruan data buku gagal', 400, errors);
  }

  return {
    id_kategori: idKategori,
    kode_buku: kodeBuku,
    isbn,
    judul,
    penulis,
    penerbit,
    tahun_terbit: tahunTerbit,
    stok_total: stokTotal,
    stok_tersedia: stokTersedia,
    hasExplicitStokTersedia,
    lokasi_rak: lokasiRak,
    deskripsi,
  };
};

module.exports = {
  parseBookId,
  parseBookQuery,
  validateCreateBook,
  validateUpdateBook,
};
