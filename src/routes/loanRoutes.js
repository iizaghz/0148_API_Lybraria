const express = require('express');
const loanController = require('../controllers/loanController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

// Semua endpoint peminjaman memerlukan autentikasi JWT
router.use(authenticate);

// Read & Search: Admin melihat semua transaksi, Anggota hanya miliknya sendiri (FR-32, FR-39)
router.get('/', loanController.listLoans);
router.get('/:id', loanController.getLoanById);

// Create: Anggota (pengajuan DIAJUKAN, FR-29) & Admin (peminjaman langsung DIPINJAM, FR-30)
router.post('/', loanController.createLoan);

// Pembatalan pengajuan oleh Anggota pemilik transaksi selama status DIAJUKAN (FR-34)
router.patch('/:id/cancel', authorize(ROLES.ANGGOTA), loanController.cancelLoan);

// Verifikasi persetujuan, penolakan, pengembalian, dan hapus: khusus ADMIN (FR-33, FR-35, FR-38)
router.patch('/:id/approve', authorize(ROLES.ADMIN), loanController.approveLoan);
router.patch('/:id/reject', authorize(ROLES.ADMIN), loanController.rejectLoan);
router.patch('/:id/return', authorize(ROLES.ADMIN), loanController.returnLoan);
router.delete('/:id', authorize(ROLES.ADMIN), loanController.deleteLoan);

module.exports = router;
