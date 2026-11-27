const AppError = require('../utils/AppError');

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Autentikasi diperlukan', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError('Anda tidak memiliki hak akses untuk fitur ini', 403)
      );
    }

    return next();
  };
};

module.exports = {
  authorize,
};
