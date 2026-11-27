const AppError = require('../utils/AppError');
const fineRepository = require('../repositories/fineRepository');
const { validateUpdateFine } = require('../validators/fineValidator');
const { ROLES, FINE_STATUS, LOAN_STATUS } = require('../constants/enums');

const listFines = async (filters, currentUser) => {
  const isAdmin = currentUser.role === ROLES.ADMIN;
  return fineRepository.findAll({
    search: filters.search,
    statusDenda: filters.statusDenda,
    idAnggota: isAdmin ? null : currentUser.id_anggota,
    isAdmin,
  });
};

const getFineById = async (idDenda, currentUser) => {
  const fine = await fineRepository.findById(idDenda);
  if (!fine) {
    throw new AppError('Catatan denda tidak ditemukan', 404);
  }

  // FR-42 & NFR-12: Anggota hanya dapat membaca denda miliknya sendiri
  if (currentUser.role !== ROLES.ADMIN && fine.id_anggota !== currentUser.id_anggota) {
    throw new AppError('Anda tidak memiliki akses ke catatan denda ini', 403);
  }

  return fine;
};

const createFine = async (data) => {
  const loan = await fineRepository.findLoanExists(data.id_peminjaman);
  if (!loan) {
    throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
  }

  const invalidStatuses = [
    LOAN_STATUS.DIAJUKAN,
    LOAN_STATUS.DITOLAK,
    LOAN_STATUS.DIBATALKAN,
  ];
  if (invalidStatuses.includes(loan.status_peminjaman)) {
    throw new AppError(
      `Denda tidak dapat dibuat untuk transaksi peminjaman berstatus ${loan.status_peminjaman}`,
      400
    );
  }

  // FR-40: Jaga keunikan id_peminjaman (maks 1 denda per peminjaman)
  const existingFine = await fineRepository.findByLoanId(data.id_peminjaman);
  if (existingFine) {
    throw new AppError(
      `Transaksi peminjaman ${loan.kode_peminjaman} sudah memiliki catatan denda`,
      409
    );
  }

  return fineRepository.create(data);
};

const updateFine = async (idDenda, rawBody) => {
  const existing = await fineRepository.findById(idDenda);
  if (!existing) {
    throw new AppError('Catatan denda tidak ditemukan', 404);
  }

  const validated = validateUpdateFine(rawBody, existing);

  // Arsip pelunasan final: denda LUNAS tidak boleh dikembalikan ke BELUM_LUNAS atau diubah nominalnya
  if (existing.status_denda === FINE_STATUS.LUNAS) {
    if (validated.status_denda !== FINE_STATUS.LUNAS) {
      throw new AppError(
        'Status denda yang sudah LUNAS tidak dapat dikembalikan menjadi BELUM_LUNAS',
        409
      );
    }
    if (
      validated.hari_terlambat !== existing.hari_terlambat ||
      validated.tarif_per_hari !== Number(existing.tarif_per_hari) ||
      validated.total_denda !== Number(existing.total_denda)
    ) {
      throw new AppError(
        'Nominal denda yang sudah LUNAS tidak dapat diubah; hanya keterangan yang dapat diperbarui',
        409
      );
    }
  }

  return fineRepository.update(idDenda, validated);
};

const payFine = async (idDenda, { tanggal_bayar, keterangan }) => {
  const existing = await fineRepository.findById(idDenda);
  if (!existing) {
    throw new AppError('Catatan denda tidak ditemukan', 404);
  }

  // FR-43: Pelunasan tunai di perpustakaan (BELUM_LUNAS -> LUNAS)
  if (existing.status_denda === FINE_STATUS.LUNAS) {
    throw new AppError('Catatan denda ini sudah berstatus LUNAS', 400);
  }

  return fineRepository.update(idDenda, {
    hari_terlambat: existing.hari_terlambat,
    tarif_per_hari: Number(existing.tarif_per_hari),
    total_denda: Number(existing.total_denda),
    status_denda: FINE_STATUS.LUNAS,
    tanggal_bayar: tanggal_bayar,
    keterangan: keterangan !== null ? keterangan : existing.keterangan,
  });
};

const deleteFine = async (idDenda) => {
  const existing = await fineRepository.findById(idDenda);
  if (!existing) {
    throw new AppError('Catatan denda tidak ditemukan', 404);
  }

  // FR-44: Catatan denda yang sudah LUNAS merupakan arsip pelunasan final dan tidak boleh dihapus
  if (existing.status_denda === FINE_STATUS.LUNAS) {
    throw new AppError(
      'Catatan denda berstatus LUNAS tidak dapat dihapus karena merupakan arsip pelunasan final',
      409
    );
  }

  return fineRepository.remove(idDenda);
};

module.exports = {
  listFines,
  getFineById,
  createFine,
  updateFine,
  payFine,
  deleteFine,
};
