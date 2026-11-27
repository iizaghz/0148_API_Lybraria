const dashboardRepository = require('../repositories/dashboardRepository');
const loanRepository = require('../repositories/loanRepository');

const getAdminSummary = async () => {
  // Pastikan status TERLAMBAT terbarui sebelum menghitung ringkasan dasbor
  await loanRepository.syncOverdueLoans();
  return dashboardRepository.getAdminSummary();
};

module.exports = {
  getAdminSummary,
};
