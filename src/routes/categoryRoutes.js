const express = require('express');
const categoryController = require('../controllers/categoryController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

// Semua endpoint kategori memerlukan autentikasi JWT
router.use(authenticate);

// Read & Search: dapat diakses oleh ADMIN dan ANGGOTA
router.get('/', categoryController.listCategories);
router.get('/:id', categoryController.getCategoryById);

// Create, Update, Delete: khusus ADMIN (FR-21)
router.post('/', authorize(ROLES.ADMIN), categoryController.createCategory);
router.put('/:id', authorize(ROLES.ADMIN), categoryController.updateCategory);
router.delete('/:id', authorize(ROLES.ADMIN), categoryController.deleteCategory);

module.exports = router;
