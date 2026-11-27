const express = require('express');
const bookController = require('../controllers/bookController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

// Semua endpoint buku memerlukan autentikasi JWT
router.use(authenticate);

// Read & Search/Filter katalog: dapat diakses oleh ADMIN dan ANGGOTA (FR-11, FR-14)
router.get('/', bookController.listBooks);
router.get('/:id', bookController.getBookById);

// Create, Update, Delete: khusus ADMIN (FR-09, FR-12, FR-13)
router.post('/', authorize(ROLES.ADMIN), bookController.createBook);
router.put('/:id', authorize(ROLES.ADMIN), bookController.updateBook);
router.patch('/:id', authorize(ROLES.ADMIN), bookController.updateBook);
router.delete('/:id', authorize(ROLES.ADMIN), bookController.deleteBook);

module.exports = router;
