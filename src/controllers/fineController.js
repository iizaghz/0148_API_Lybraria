const fineService = require('../services/fineService');
const {
  parseFineId,
  parseFineQuery,
  validateCreateFine,
  validatePayFine,
} = require('../validators/fineValidator');
const { sendSuccess } = require('../utils/response');

const listFines = async (req, res, next) => {
  try {
    const filters = parseFineQuery(req.query);
    const fines = await fineService.listFines(filters, req.user);
    return sendSuccess(res, 'Daftar catatan denda berhasil diambil', fines, 200, {
      total: fines.length,
    });
  } catch (error) {
    return next(error);
  }
};

const getFineById = async (req, res, next) => {
  try {
    const id = parseFineId(req.params.id);
    const fine = await fineService.getFineById(id, req.user);
    return sendSuccess(res, 'Detail catatan denda berhasil diambil', fine, 200);
  } catch (error) {
    return next(error);
  }
};

const createFine = async (req, res, next) => {
  try {
    const payload = validateCreateFine(req.body);
    const created = await fineService.createFine(payload);
    return sendSuccess(res, 'Catatan denda berhasil ditambahkan', created, 201);
  } catch (error) {
    return next(error);
  }
};

const updateFine = async (req, res, next) => {
  try {
    const id = parseFineId(req.params.id);
    const updated = await fineService.updateFine(id, req.body);
    return sendSuccess(res, 'Catatan denda berhasil diperbarui', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const payFine = async (req, res, next) => {
  try {
    const id = parseFineId(req.params.id);
    const payload = validatePayFine(req.body);
    const paid = await fineService.payFine(id, payload);
    return sendSuccess(res, 'Pelunasan denda tunai berhasil dicatat', paid, 200);
  } catch (error) {
    return next(error);
  }
};

const deleteFine = async (req, res, next) => {
  try {
    const id = parseFineId(req.params.id);
    const deleted = await fineService.deleteFine(id);
    return sendSuccess(res, 'Catatan denda korektif berhasil dihapus', deleted, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listFines,
  getFineById,
  createFine,
  updateFine,
  payFine,
  deleteFine,
};
