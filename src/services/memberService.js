const AppError = require('../utils/AppError');
const memberRepository = require('../repositories/memberRepository');
const { validateUpdateMember } = require('../validators/memberValidator');
const { hashPassword } = require('../utils/password');
const { ACCOUNT_STATUS, ROLES } = require('../constants/enums');

const listMembers = async (filters) => {
  return memberRepository.findAllMembers(filters);
};

const getMemberById = async (idAnggota) => {
  const member = await memberRepository.findById(idAnggota);
  if (!member || member.role !== ROLES.ANGGOTA) {
    throw new AppError('Data anggota tidak ditemukan', 404);
  }
  return member;
};

const getMyProfile = async (idAnggota) => {
  const profile = await memberRepository.findById(idAnggota);
  if (!profile) {
    throw new AppError('Profil akun tidak ditemukan', 404);
  }
  return profile;
};

const createMember = async (data) => {
  const dupNim = await memberRepository.findByNim(data.nim);
  if (dupNim) {
    throw new AppError(`NIM "${data.nim}" sudah terdaftar`, 409);
  }

  const dupEmail = await memberRepository.findByEmail(data.email);
  if (dupEmail) {
    throw new AppError(`Email "${data.email}" sudah terdaftar`, 409);
  }

  const passwordHash = await hashPassword(data.password);

  return memberRepository.createMember({
    nim: data.nim,
    nama_lengkap: data.nama_lengkap,
    email: data.email,
    password_hash: passwordHash,
    program_studi: data.program_studi,
    no_telepon: data.no_telepon,
  });
};

const updateMember = async (idAnggota, rawBody, currentAdminId) => {
  const existing = await memberRepository.findById(idAnggota);
  if (!existing) {
    throw new AppError('Data anggota tidak ditemukan', 404);
  }

  const validated = validateUpdateMember(rawBody, existing);

  // FR-28: Admin tidak dapat menonaktifkan akun yang sedang digunakan untuk login
  if (idAnggota === currentAdminId && validated.status_akun === ACCOUNT_STATUS.NONAKTIF) {
    throw new AppError(
      'Admin tidak dapat menghapus atau menonaktifkan akun yang sedang digunakan untuk login',
      400
    );
  }

  if (existing.role !== ROLES.ANGGOTA) {
    throw new AppError('Hanya akun dengan peran ANGGOTA yang dapat diubah di menu ini', 403);
  }

  if (validated.nim) {
    const dupNim = await memberRepository.findByNim(validated.nim, idAnggota);
    if (dupNim) {
      throw new AppError(`NIM "${validated.nim}" sudah digunakan akun lain`, 409);
    }
  }

  const dupEmail = await memberRepository.findByEmail(validated.email, idAnggota);
  if (dupEmail) {
    throw new AppError(`Email "${validated.email}" sudah digunakan akun lain`, 409);
  }

  const passwordHash = validated.password ? await hashPassword(validated.password) : null;

  return memberRepository.updateMember(idAnggota, {
    nim: validated.nim,
    nama_lengkap: validated.nama_lengkap,
    email: validated.email,
    program_studi: validated.program_studi,
    no_telepon: validated.no_telepon,
    status_akun: validated.status_akun,
    password_hash: passwordHash,
  });
};

const deleteMember = async (idAnggota, currentAdminId) => {
  // FR-28: Pencegahan hapus / nonaktifkan akun Admin yang sedang login
  if (idAnggota === currentAdminId) {
    throw new AppError(
      'Admin tidak dapat menghapus atau menonaktifkan akun yang sedang digunakan untuk login',
      400
    );
  }

  const existing = await memberRepository.findById(idAnggota);
  if (!existing) {
    throw new AppError('Data anggota tidak ditemukan', 404);
  }

  if (existing.role !== ROLES.ANGGOTA) {
    throw new AppError('Hanya akun dengan peran ANGGOTA yang dapat dinonaktifkan di menu ini', 403);
  }

  if (existing.status_akun === ACCOUNT_STATUS.NONAKTIF) {
    throw new AppError('Akun anggota sudah berstatus NONAKTIF', 400);
  }

  // FR-25: Tolak jika Anggota masih memiliki peminjaman aktif atau denda BELUM_LUNAS
  const obligations = await memberRepository.countActiveObligations(idAnggota);
  if (obligations.peminjaman_aktif > 0) {
    throw new AppError(
      `Akun anggota tidak dapat dinonaktifkan karena masih memiliki ${obligations.peminjaman_aktif} peminjaman aktif`,
      409
    );
  }

  if (obligations.denda_belum_lunas > 0) {
    throw new AppError(
      `Akun anggota tidak dapat dinonaktifkan karena masih memiliki ${obligations.denda_belum_lunas} denda yang belum lunas`,
      409
    );
  }

  // Soft-delete: ubah status_akun = NONAKTIF tanpa menghapus riwayat transaksi
  return memberRepository.deactivateMember(idAnggota);
};

module.exports = {
  listMembers,
  getMemberById,
  getMyProfile,
  createMember,
  updateMember,
  deleteMember,
};
