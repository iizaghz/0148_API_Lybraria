const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../utils/token');
const authRepository = require('../repositories/authRepository');
const { ACCOUNT_STATUS } = require('../constants/enums');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Token autentikasi tidak ditemukan', 401));
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return next(new AppError('Token autentikasi tidak valid', 401));
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Sesi telah kedaluwarsa, silakan perbarui token', 401));
      }
      return next(new AppError('Token autentikasi tidak valid', 401));
    }

    const user = await authRepository.findById(decoded.id_anggota);
    if (!user) {
      return next(new AppError('Akun pengguna tidak ditemukan', 401));
    }

    if (user.status_akun !== ACCOUNT_STATUS.AKTIF) {
      return next(new AppError('Akun Anda berstatus NONAKTIF', 403));
    }

    req.user = {
      id_anggota: user.id_anggota,
      nim: user.nim,
      nama_lengkap: user.nama_lengkap,
      email: user.email,
      role: user.role,
      status_akun: user.status_akun,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  authenticate,
};
