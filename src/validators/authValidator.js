const AppError = require('../utils/AppError');

const validateLogin = (body = {}) => {
  const rawIdentifier = body.identifier ?? body.email ?? body.nim;
  const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = [];

  if (!identifier) {
    errors.push({ field: 'identifier', message: 'Email atau NIM wajib diisi' });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'Kata sandi wajib diisi' });
  }

  if (errors.length > 0) {
    throw new AppError('Validasi login gagal', 400, errors);
  }

  return { identifier, password };
};

const validateRefresh = (body = {}) => {
  const refreshToken =
    typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';

  if (!refreshToken) {
    throw new AppError('Validasi refresh token gagal', 400, [
      { field: 'refresh_token', message: 'Refresh token wajib diisi' },
    ]);
  }

  return { refreshToken };
};

module.exports = {
  validateLogin,
  validateRefresh,
};
