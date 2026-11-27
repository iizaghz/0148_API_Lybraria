const memberService = require('../services/memberService');
const {
  parseMemberId,
  parseMemberQuery,
  validateCreateMember,
} = require('../validators/memberValidator');
const { sendSuccess } = require('../utils/response');

const getMyProfile = async (req, res, next) => {
  try {
    const profile = await memberService.getMyProfile(req.user.id_anggota);
    return sendSuccess(res, 'Profil keanggotaan pribadi berhasil diambil', profile, 200);
  } catch (error) {
    return next(error);
  }
};

const listMembers = async (req, res, next) => {
  try {
    const filters = parseMemberQuery(req.query);
    const members = await memberService.listMembers(filters);
    return sendSuccess(res, 'Daftar anggota berhasil diambil', members, 200, {
      total: members.length,
    });
  } catch (error) {
    return next(error);
  }
};

const getMemberById = async (req, res, next) => {
  try {
    const id = parseMemberId(req.params.id);
    const member = await memberService.getMemberById(id);
    return sendSuccess(res, 'Detail anggota berhasil diambil', member, 200);
  } catch (error) {
    return next(error);
  }
};

const createMember = async (req, res, next) => {
  try {
    const payload = validateCreateMember(req.body);
    const created = await memberService.createMember(payload);
    return sendSuccess(res, 'Anggota baru berhasil didaftarkan', created, 201);
  } catch (error) {
    return next(error);
  }
};

const updateMember = async (req, res, next) => {
  try {
    const id = parseMemberId(req.params.id);
    const updated = await memberService.updateMember(id, req.body, req.user.id_anggota);
    return sendSuccess(res, 'Data anggota berhasil diperbarui', updated, 200);
  } catch (error) {
    return next(error);
  }
};

const deleteMember = async (req, res, next) => {
  try {
    const id = parseMemberId(req.params.id);
    const deactivated = await memberService.deleteMember(id, req.user.id_anggota);
    return sendSuccess(res, 'Akun anggota berhasil dinonaktifkan (soft-delete)', deactivated, 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getMyProfile,
  listMembers,
  getMemberById,
  createMember,
  updateMember,
  deleteMember,
};
