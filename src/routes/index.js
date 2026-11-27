const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/health', async (req, res, next) => {
  try {
    const dbInfo = await db.testConnection();
    res.status(200).json({
      success: true,
      message: 'Lybraria Backend API berjalan dengan baik',
      data: {
        status: 'OK',
        database: 'CONNECTED',
        server_time: dbInfo.server_time,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
