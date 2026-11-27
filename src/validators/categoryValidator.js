const AppError = require('../utils/AppError');
const { parseStrictPositiveId } = require('../utils/validation');

const parseCategoryId = (rawId) => parseStrictPositiveId(rawId, 'ID kategori');

const validateCategoryPayload = (body = {}) => {
  const errors = [];

  const namaKategori =
    typeof body.nama_kategori === 'string' ? body.nama_kategori.trim() : '';

  if (!namaKategori) {
    errors.push({ field: 'nama_kategori', message: 'Nama kategori wajib diisi' });
  } else if (namaKategori.length > 100) {
    errors.push({
      field: 'nama_kategori',
      message: 'Nama kategori maksimal 100 karakter',
    });
  }

  let deskripsi = null;
  if (body.deskripsi !== undefined && body.deskripsi !== null) {
    if (typeof body.deskripsi !== 'string') {
      errors.push({ field: 'deskripsi', message: 'Deskripsi harus berupa teks' });
    } else {
      const trimmed = body.deskripsi.trim();
      deskripsi = trimmed.length > 0 ? trimmed : null;
    }
  }

  if (errors.length > 0) {
    throw new AppError('Validasi data kategori gagal', 400, errors);
  }

  return {
    nama_kategori: namaKategori,
    deskripsi,
  };
};

const parseSearchQuery = (query = {}) => {
  const raw = query.q ?? query.search ?? '';
  const search = typeof raw === 'string' ? raw.trim() : '';
  return { search: search || null };
};

module.exports = {
  parseCategoryId,
  validateCategoryPayload,
  parseSearchQuery,
};
