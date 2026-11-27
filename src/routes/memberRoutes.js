const express = require('express');
const memberController = require('../controllers/memberController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

// Semua endpoint anggota memerlukan autentikasi JWT
router.use(authenticate);

// Profil pribadi: dapat diakses oleh Anggota dan Admin (Gambar 3.23)
router.get('/me', memberController.getMyProfile);

// Pengelolaan penuh data Anggota (CRUDS): khusus ADMIN (FR-22 s/d FR-28, NFR-14)
router.get('/', authorize(ROLES.ADMIN), memberController.listMembers);
router.get('/:id', authorize(ROLES.ADMIN), memberController.getMemberById);
router.post('/', authorize(ROLES.ADMIN), memberController.createMember);
router.put('/:id', authorize(ROLES.ADMIN), memberController.updateMember);
router.patch('/:id', authorize(ROLES.ADMIN), memberController.updateMember);
router.delete('/:id', authorize(ROLES.ADMIN), memberController.deleteMember);

module.exports = router;
