const AppError = require('../utils/AppError');

const MAX_IDENTIFIER_LENGTH = 150;
const MAX_PASSWORD_LENGTH = 72;

const validateLogin = (body = {}) => {
  const rawIdentifier = body.identifier ?? body.email ?? body.nim;
  const identifier = typeof rawIdentifier === 'string' ? rawIdentifier.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const errors = [];

  if (!identifier) {
    errors.push({ field: 'identifier', message: 'Email atau NIM wajib diisi' });
  } else if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    errors.push({
      field: 'identifier',
      message: `Email atau NIM maksimal ${MAX_IDENTIFIER_LENGTH} karakter`,
    });
  }

  if (!password) {
    errors.push({ field: 'password', message: 'Kata sandi wajib diisi' });
  } else if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push({
      field: 'password',
      message: `Kata sandi maksimal ${MAX_PASSWORD_LENGTH} karakter`,
    });
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
