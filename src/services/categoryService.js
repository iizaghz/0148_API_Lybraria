const AppError = require('../utils/AppError');
const categoryRepository = require('../repositories/categoryRepository');

const listCategories = async ({ search } = {}) => {
  return categoryRepository.findAll({ search });
};

const getCategoryById = async (idKategori) => {
  const category = await categoryRepository.findById(idKategori);
  if (!category) {
    throw new AppError('Kategori tidak ditemukan', 404);
  }
  return category;
};

const createCategory = async ({ nama_kategori, deskripsi }) => {
  const existing = await categoryRepository.findByName(nama_kategori);
  if (existing) {
    throw new AppError(`Nama kategori "${nama_kategori}" sudah terdaftar`, 409);
  }

  return categoryRepository.create({ nama_kategori, deskripsi });
};

const updateCategory = async (idKategori, { nama_kategori, deskripsi }) => {
  const existing = await categoryRepository.findById(idKategori);
  if (!existing) {
    throw new AppError('Kategori tidak ditemukan', 404);
  }

  const duplicate = await categoryRepository.findByName(nama_kategori, idKategori);
  if (duplicate) {
    throw new AppError(`Nama kategori "${nama_kategori}" sudah digunakan`, 409);
  }

  await categoryRepository.update(idKategori, { nama_kategori, deskripsi });
  return categoryRepository.findById(idKategori);
};

const deleteCategory = async (idKategori) => {
  const existing = await categoryRepository.findById(idKategori);
  if (!existing) {
    throw new AppError('Kategori tidak ditemukan', 404);
  }

  const bookCount = await categoryRepository.countReferencedBooks(idKategori);
  if (bookCount > 0) {
    throw new AppError(
      `Kategori tidak dapat dihapus karena masih digunakan oleh ${bookCount} data buku`,
      409
    );
  }

  return categoryRepository.remove(idKategori);
};

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
