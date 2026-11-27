const dashboardService = require('../services/dashboardService');
const { sendSuccess } = require('../utils/response');

const getAdminSummary = async (req, res, next) => {
  try {
    const summary = await dashboardService.getAdminSummary();
    return sendSuccess(res, 'Ringkasan statistik dasbor berhasil diambil', summary, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAdminSummary,
};
