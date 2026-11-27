const AppError = require('../utils/AppError');
const authRepository = require('../repositories/authRepository');
const { comparePassword } = require('../utils/password');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  verifyTokenHash,
} = require('../utils/token');
const { ACCOUNT_STATUS } = require('../constants/enums');

const sanitizeUser = (user) => ({
  id_anggota: user.id_anggota,
  nim: user.nim,
  nama_lengkap: user.nama_lengkap,
  email: user.email,
  program_studi: user.program_studi,
  no_telepon: user.no_telepon,
  role: user.role,
  status_akun: user.status_akun,
  created_at: user.created_at,
  updated_at: user.updated_at,
});

const login = async ({ identifier, password }) => {
  const user = await authRepository.findByIdentifier(identifier);

  if (!user) {
    throw new AppError('Email/NIM atau kata sandi salah', 401);
  }

  const isPasswordValid = await comparePassword(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError('Email/NIM atau kata sandi salah', 401);
  }

  if (user.status_akun !== ACCOUNT_STATUS.AKTIF) {
    throw new AppError(
      'Akun Anda berstatus NONAKTIF. Silakan hubungi Admin perpustakaan.',
      403
    );
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);

  await authRepository.updateRefreshTokenHash(user.id_anggota, refreshTokenHash);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    user: sanitizeUser(user),
  };
};

const refresh = async ({ refreshToken }) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new AppError('Refresh token tidak valid atau sudah kedaluwarsa', 401);
  }

  if (decoded.type !== 'refresh' || !decoded.id_anggota) {
    throw new AppError('Refresh token tidak valid', 401);
  }

  const user = await authRepository.findById(decoded.id_anggota);
  if (!user) {
    throw new AppError('Akun pengguna tidak ditemukan', 401);
  }

  if (user.status_akun !== ACCOUNT_STATUS.AKTIF) {
    throw new AppError(
      'Akun Anda berstatus NONAKTIF. Silakan hubungi Admin perpustakaan.',
      403
    );
  }

  const isHashMatch = verifyTokenHash(refreshToken, user.refresh_token_hash);
  if (!isHashMatch) {
    throw new AppError('Refresh token telah direvokasi atau tidak valid', 401);
  }

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);
  const newRefreshTokenHash = hashToken(newRefreshToken);

  // Atomic Compare-And-Swap untuk mencegah race condition rotasi refresh token paralel
  const rotated = await authRepository.rotateRefreshTokenHashAtomic(
    user.id_anggota,
    user.refresh_token_hash,
    newRefreshTokenHash
  );
  if (!rotated) {
    throw new AppError('Refresh token telah digunakan atau sesi sudah berakhir', 401);
  }

  return {
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    token_type: 'Bearer',
    user: sanitizeUser(user),
  };
};

const logout = async (idAnggota) => {
  await authRepository.updateRefreshTokenHash(idAnggota, null);
};

const getMe = async (idAnggota) => {
  const user = await authRepository.findById(idAnggota);
  if (!user) {
    throw new AppError('Akun pengguna tidak ditemukan', 404);
  }
  return sanitizeUser(user);
};

module.exports = {
  login,
  refresh,
  logout,
  getMe,
  sanitizeUser,
};
