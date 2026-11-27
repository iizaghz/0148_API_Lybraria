const express = require('express');
const fineController = require('../controllers/fineController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

// Semua endpoint denda memerlukan autentikasi JWT
router.use(authenticate);

// Read & Search: Admin melihat semua denda, Anggota hanya denda pribadinya (FR-42, FR-45)
router.get('/', fineController.listFines);
router.get('/:id', fineController.getFineById);

// Create korektif, Update koreksi/pelunasan tunai, & Delete: khusus ADMIN (FR-40, FR-43, FR-44, FR-46)
router.post('/', authorize(ROLES.ADMIN), fineController.createFine);
router.put('/:id', authorize(ROLES.ADMIN), fineController.updateFine);
router.patch('/:id', authorize(ROLES.ADMIN), fineController.updateFine);
router.patch('/:id/pay', authorize(ROLES.ADMIN), fineController.payFine);
router.delete('/:id', authorize(ROLES.ADMIN), fineController.deleteFine);

module.exports = router;
