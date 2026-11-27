const bookService = require('../services/bookService');
const {
  parseBookId,
  parseBookQuery,
  validateCreateBook,
} = require('../validators/bookValidator');
const { sendSuccess } = require('../utils/response');

const listBooks = async (req, res, next) => {
  try {
    const filters = parseBookQuery(req.query);
    const books = await bookService.listBooks(filters, req.user.role);
    return sendSuccess(res, 'Daftar buku berhasil diambil', books, 200, {
      total: books.length,
    });
  } catch (error) {
    return next(error);
  }
};

const getBookById = async (req, res, next) => {
  try {
    const id = parseBookId(req.params.id);
    const book = await bookService.getBookById(id, req.user.role);
    return sendSuccess(res, 'Detail buku berhasil diambil', book, 200);
  } catch (error) {
    return next(error);
  }
};

const createBook = async (req, res, next) => {
  try {
    const payload = validateCreateBook(req.body);
    const created = await bookService.createBook(payload);
    return sendSuccess(res, 'Buku berhasil ditambahkan', created, 201);
  } catch (error) {
    return next(error);
  }
};

const updateBook = async (req, res, next) => {
  try {
    const id = parseBookId(req.params.id);
    const updated = await bookService.updateBook(id, req.body);
    return sendSuccess(res, 'Data buku berhasil diperbarui', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const deleteBook = async (req, res, next) => {
  try {
    const id = parseBookId(req.params.id);
    const deleted = await bookService.deleteBook(id);
    return sendSuccess(res, 'Buku berhasil dinonaktifkan (soft-delete)', deleted, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listBooks,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
};
