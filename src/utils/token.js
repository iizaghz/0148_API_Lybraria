const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const getAccessSecret = () => {
  if (!process.env.JWT_ACCESS_SECRET) {
    throw new Error('JWT_ACCESS_SECRET belum dikonfigurasi pada environment');
  }
  return process.env.JWT_ACCESS_SECRET;
};

const getRefreshSecret = () => {
  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_REFRESH_SECRET belum dikonfigurasi pada environment');
  }
  return process.env.JWT_REFRESH_SECRET;
};

const generateAccessToken = (user) => {
  const payload = {
    id_anggota: user.id_anggota,
    role: user.role,
    email: user.email,
    nim: user.nim,
  };

  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
  });
};

const generateRefreshToken = (user) => {
  const payload = {
    id_anggota: user.id_anggota,
    role: user.role,
    type: 'refresh',
    jti: crypto.randomUUID(),
  };

  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret());
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshSecret());
};

const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const verifyTokenHash = (token, storedHash) => {
  if (!token || !storedHash) return false;

  const incomingHash = hashToken(token);
  const incomingBuf = Buffer.from(incomingHash, 'utf8');
  const storedBuf = Buffer.from(storedHash, 'utf8');

  if (incomingBuf.length !== storedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(incomingBuf, storedBuf);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  verifyTokenHash,
};
