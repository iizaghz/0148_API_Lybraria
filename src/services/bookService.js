const db = require('../config/db');
const AppError = require('../utils/AppError');
const bookRepository = require('../repositories/bookRepository');
const categoryRepository = require('../repositories/categoryRepository');
const { validateUpdateBook } = require('../validators/bookValidator');
const { ROLES } = require('../constants/enums');

const listBooks = async (filters, userRole) => {
  const allowInactive = userRole === ROLES.ADMIN && Boolean(filters.includeInactive);

  return bookRepository.findAll({
    search: filters.search,
    idKategori: filters.idKategori,
    includeInactive: allowInactive,
    availableOnly: Boolean(filters.availableOnly),
  });
};

const getBookById = async (idBuku, userRole) => {
  const book = await bookRepository.findById(idBuku);
  if (!book || (!book.is_active && userRole !== ROLES.ADMIN)) {
    throw new AppError('Buku tidak ditemukan', 404);
  }
  return book;
};

const createBook = async (data) => {
  const category = await categoryRepository.findById(data.id_kategori);
  if (!category) {
    throw new AppError('Kategori buku tidak ditemukan', 404);
  }

  const dupKode = await bookRepository.findByKodeBuku(data.kode_buku);
  if (dupKode) {
    throw new AppError(`Kode buku "${data.kode_buku}" sudah terdaftar`, 409);
  }

  if (data.isbn) {
    const dupIsbn = await bookRepository.findByIsbn(data.isbn);
    if (dupIsbn) {
      throw new AppError(`ISBN "${data.isbn}" sudah terdaftar`, 409);
    }
  }

  return bookRepository.create(data);
};

const updateBook = async (idBuku, rawBody) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Lock baris buku (FOR UPDATE) agar perhitungan stok bebas race condition dengan sirkulasi (NFR-06)
    const existingBook = await bookRepository.lockByIdForUpdate(idBuku, client);
    if (!existingBook) {
      throw new AppError('Buku tidak ditemukan', 404);
    }

    const validated = validateUpdateBook(rawBody, existingBook);

    const category = await categoryRepository.findById(validated.id_kategori);
    if (!category) {
      throw new AppError('Kategori buku tidak ditemukan', 404);
    }

    const dupKode = await bookRepository.findByKodeBuku(validated.kode_buku, idBuku, client);
    if (dupKode) {
      throw new AppError(`Kode buku "${validated.kode_buku}" sudah digunakan buku lain`, 409);
    }

    if (validated.isbn) {
      const dupIsbn = await bookRepository.findByIsbn(validated.isbn, idBuku, client);
      if (dupIsbn) {
        throw new AppError(`ISBN "${validated.isbn}" sudah digunakan buku lain`, 409);
      }
    }

    // FR-12: Pastikan stok_total tidak lebih kecil dari eksemplar yang sedang DIPINJAM / TERLAMBAT
    const borrowedCopies = await bookRepository.getBorrowedCopiesCount(idBuku, client);
    if (validated.stok_total < borrowedCopies) {
      throw new AppError(
        `Stok total (${validated.stok_total}) tidak boleh lebih kecil dari jumlah buku yang sedang dipinjam (${borrowedCopies})`,
        400
      );
    }

    const maxAvailable = validated.stok_total - borrowedCopies;
    if (!validated.hasExplicitStokTersedia) {
      validated.stok_tersedia = maxAvailable;
    } else if (validated.stok_tersedia > maxAvailable) {
      throw new AppError(
        `Stok tersedia (${validated.stok_tersedia}) melebihi sisa stok yang tidak sedang dipinjam (${maxAvailable})`,
        400
      );
    }

    const updated = await bookRepository.update(idBuku, validated, client);
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteBook = async (idBuku) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const existingBook = await bookRepository.lockByIdForUpdate(idBuku, client);
    if (!existingBook) {
      throw new AppError('Buku tidak ditemukan', 404);
    }

    if (!existingBook.is_active) {
      throw new AppError('Buku sudah dalam status nonaktif', 400);
    }

    // FR-13: Tolak penghapusan jika masih memiliki peminjaman aktif
    const activeLoans = await bookRepository.countActiveLoans(idBuku, client);
    if (activeLoans > 0) {
      throw new AppError(
        `Buku tidak dapat dihapus karena masih memiliki ${activeLoans} peminjaman aktif`,
        409
      );
    }

    // Soft-delete (is_active = FALSE) tanpa menghapus riwayat transaksi
    const deleted = await bookRepository.softDelete(idBuku, client);
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
};
