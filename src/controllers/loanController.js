const loanService = require('../services/loanService');
const {
  parseLoanId,
  parseLoanQuery,
  validateCreateLoan,
  validateApproveLoan,
  validateRejectOrCancelLoan,
  validateReturnLoan,
} = require('../validators/loanValidator');
const { sendSuccess } = require('../utils/response');
const { ROLES } = require('../constants/enums');

const listLoans = async (req, res, next) => {
  try {
    const filters = parseLoanQuery(req.query);
    const loans = await loanService.listLoans(filters, req.user);
    return sendSuccess(res, 'Daftar transaksi peminjaman berhasil diambil', loans, 200, {
      total: loans.length,
    });
  } catch (error) {
    return next(error);
  }
};

const getLoanById = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const loan = await loanService.getLoanById(id, req.user);
    return sendSuccess(res, 'Detail transaksi peminjaman berhasil diambil', loan, 200);
  } catch (error) {
    return next(error);
  }
};

const createLoan = async (req, res, next) => {
  try {
    const payload = validateCreateLoan(req.body, req.user.role);
    const created = await loanService.createLoan(payload, req.user);
    const message =
      req.user.role === ROLES.ADMIN
        ? 'Peminjaman langsung berhasil dicatat'
        : 'Pengajuan peminjaman buku berhasil dikirim';
    return sendSuccess(res, message, created, 201);
  } catch (error) {
    return next(error);
  }
};

const approveLoan = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const payload = validateApproveLoan(req.body);
    const updated = await loanService.approveLoan(id, payload);
    return sendSuccess(res, 'Pengajuan peminjaman berhasil disetujui', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const rejectLoan = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const payload = validateRejectOrCancelLoan(req.body);
    const updated = await loanService.rejectLoan(id, payload);
    return sendSuccess(res, 'Pengajuan peminjaman berhasil ditolak', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const cancelLoan = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const payload = validateRejectOrCancelLoan(req.body);
    const updated = await loanService.cancelLoan(id, payload, req.user);
    return sendSuccess(res, 'Pengajuan peminjaman berhasil dibatalkan', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const returnLoan = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const payload = validateReturnLoan(req.body);
    const updated = await loanService.returnLoan(id, payload);
    return sendSuccess(res, 'Pengembalian buku berhasil diproses', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const deleteLoan = async (req, res, next) => {
  try {
    const id = parseLoanId(req.params.id);
    const deleted = await loanService.deleteLoan(id);
    return sendSuccess(res, 'Catatan peminjaman berhasil dihapus', deleted, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listLoans,
  getLoanById,
  createLoan,
  approveLoan,
  rejectLoan,
  cancelLoan,
  returnLoan,
  deleteLoan,
};
