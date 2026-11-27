const authService = require('../services/authService');
const { validateLogin, validateRefresh } = require('../validators/authValidator');
const { sendSuccess } = require('../utils/response');

const login = async (req, res, next) => {
  try {
    const payload = validateLogin(req.body);
    const result = await authService.login(payload);
    return sendSuccess(res, 'Login berhasil', result, 200);
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const payload = validateRefresh(req.body);
    const result = await authService.refresh(payload);
    return sendSuccess(res, 'Token berhasil diperbarui', result, 200);
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id_anggota);
    return sendSuccess(res, 'Logout berhasil', null, 200);
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const profile = await authService.getMe(req.user.id_anggota);
    return sendSuccess(res, 'Data profil berhasil diambil', profile, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  login,
  refresh,
  logout,
  me,
};
