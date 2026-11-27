const categoryService = require('../services/categoryService');
const {
  parseCategoryId,
  validateCategoryPayload,
  parseSearchQuery,
} = require('../validators/categoryValidator');
const { sendSuccess } = require('../utils/response');

const listCategories = async (req, res, next) => {
  try {
    const { search } = parseSearchQuery(req.query);
    const categories = await categoryService.listCategories({ search });
    return sendSuccess(res, 'Daftar kategori berhasil diambil', categories, 200, {
      total: categories.length,
    });
  } catch (error) {
    return next(error);
  }
};

const getCategoryById = async (req, res, next) => {
  try {
    const id = parseCategoryId(req.params.id);
    const category = await categoryService.getCategoryById(id);
    return sendSuccess(res, 'Detail kategori berhasil diambil', category, 200);
  } catch (error) {
    return next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const payload = validateCategoryPayload(req.body);
    const created = await categoryService.createCategory(payload);
    return sendSuccess(res, 'Kategori berhasil ditambahkan', created, 201);
  } catch (error) {
    return next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const id = parseCategoryId(req.params.id);
    const payload = validateCategoryPayload(req.body);
    const updated = await categoryService.updateCategory(id, payload);
    return sendSuccess(res, 'Kategori berhasil diperbarui', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    const id = parseCategoryId(req.params.id);
    const deleted = await categoryService.deleteCategory(id);
    return sendSuccess(res, 'Kategori berhasil dihapus', deleted, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
