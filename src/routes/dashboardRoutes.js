const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../constants/enums');

const router = express.Router();

router.use(authenticate);

// Dasbor ringkasan statistik perpustakaan: khusus ADMIN (SRS Section 4.1)
router.get('/summary', authorize(ROLES.ADMIN), dashboardController.getAdminSummary);

module.exports = router;
