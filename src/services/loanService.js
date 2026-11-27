const crypto = require('crypto');
const db = require('../config/db');
const AppError = require('../utils/AppError');
const loanRepository = require('../repositories/loanRepository');
const {
  getTodayDateString,
  addDaysToDateString,
  diffDaysBetweenDates,
} = require('../validators/loanValidator');
const {
  ROLES,
  ACCOUNT_STATUS,
  LOAN_STATUS,
  FINE_STATUS,
  BUSINESS_RULES,
} = require('../constants/enums');

const generateLoanCode = (dateStr) => {
  const compactDate = dateStr.replace(/-/g, '');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PJM-${compactDate}-${suffix}`;
};

const listLoans = async (filters, currentUser) => {
  // FR-37: Deteksi keterlambatan otomatis sebelum membaca daftar transaksi
  await loanRepository.syncOverdueLoans();

  const isAdmin = currentUser.role === ROLES.ADMIN;
  return loanRepository.findAll({
    search: filters.search,
    statusPeminjaman: filters.statusPeminjaman,
    idAnggota: isAdmin ? filters.idAnggota : currentUser.id_anggota,
    idBuku: filters.idBuku,
    isAdmin,
  });
};

const getLoanById = async (idPeminjaman, currentUser) => {
  await loanRepository.syncOverdueLoans();

  const loan = await loanRepository.findById(idPeminjaman);
  if (!loan) {
    throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
  }

  // FR-32 & NFR-12: Anggota hanya dapat membaca transaksi miliknya sendiri
  if (currentUser.role !== ROLES.ADMIN && loan.id_anggota !== currentUser.id_anggota) {
    throw new AppError('Anda tidak memiliki akses ke transaksi peminjaman ini', 403);
  }

  return loan;
};

const createLoan = async (payload, currentUser) => {
  const today = getTodayDateString();

  // FR-29: Pengajuan peminjaman oleh Anggota -> status awal DIAJUKAN
  if (currentUser.role === ROLES.ANGGOTA) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const book = await loanRepository.lockBookForUpdate(payload.id_buku, client);
      if (!book || !book.is_active) {
        throw new AppError('Buku tidak ditemukan atau sudah tidak aktif', 404);
      }

      // FR-31: Cegah pengajuan jika jumlah melebihi stok_tersedia
      if (book.stok_tersedia < payload.jumlah) {
        throw new AppError(
          `Stok buku "${book.judul}" tidak mencukupi (tersedia: ${book.stok_tersedia})`,
          400
        );
      }

      const idPeminjaman = await loanRepository.createLoan(
        {
          kode_peminjaman: generateLoanCode(today),
          id_anggota: currentUser.id_anggota,
          id_buku: payload.id_buku,
          jumlah: payload.jumlah,
          tanggal_pengajuan: today,
          tanggal_pinjam: null,
          tanggal_jatuh_tempo: null,
          status_peminjaman: LOAN_STATUS.DIAJUKAN,
          catatan: payload.catatan,
        },
        client
      );

      await client.query('COMMIT');
      return loanRepository.findById(idPeminjaman);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // FR-30: Peminjaman langsung oleh Admin -> status DIPINJAM + kurangi stok atomik (NFR-06)
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const member = await loanRepository.findMemberBasic(payload.id_anggota, client);
    if (!member || member.role !== ROLES.ANGGOTA) {
      throw new AppError('Anggota peminjam tidak ditemukan', 404);
    }

    if (member.status_akun !== ACCOUNT_STATUS.AKTIF) {
      throw new AppError('Akun anggota berstatus NONAKTIF dan tidak dapat meminjam buku', 400);
    }

    const book = await loanRepository.lockBookForUpdate(payload.id_buku, client);
    if (!book || !book.is_active) {
      throw new AppError('Buku tidak ditemukan atau sudah tidak aktif', 404);
    }

    if (book.stok_tersedia < payload.jumlah) {
      throw new AppError(
        `Stok buku "${book.judul}" tidak mencukupi (tersedia: ${book.stok_tersedia})`,
        400
      );
    }

    const tanggalPinjam = payload.tanggal_pinjam || today;
    const tanggalJatuhTempo =
      payload.tanggal_jatuh_tempo ||
      addDaysToDateString(tanggalPinjam, BUSINESS_RULES.DEFAULT_LOAN_DAYS);

    if (diffDaysBetweenDates(tanggalPinjam, tanggalJatuhTempo) < 0) {
      throw new AppError(
        'Tanggal jatuh tempo tidak boleh lebih awal dari tanggal pinjam',
        400
      );
    }

    await loanRepository.adjustBookStock(book.id_buku, -payload.jumlah, client);

    const idPeminjaman = await loanRepository.createLoan(
      {
        kode_peminjaman: generateLoanCode(tanggalPinjam),
        id_anggota: member.id_anggota,
        id_buku: book.id_buku,
        jumlah: payload.jumlah,
        tanggal_pengajuan: tanggalPinjam,
        tanggal_pinjam: tanggalPinjam,
        tanggal_jatuh_tempo: tanggalJatuhTempo,
        status_peminjaman: LOAN_STATUS.DIPINJAM,
        catatan: payload.catatan,
      },
      client
    );

    await client.query('COMMIT');
    return loanRepository.findById(idPeminjaman);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const approveLoan = async (idPeminjaman, payload) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const loan = await loanRepository.findRawForUpdate(idPeminjaman, client);
    if (!loan) {
      throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
    }

    // FR-33 & FR-36: Hanya status DIAJUKAN yang dapat disetujui
    if (loan.status_peminjaman !== LOAN_STATUS.DIAJUKAN) {
      throw new AppError(
        `Transaksi berstatus ${loan.status_peminjaman} tidak dapat disetujui`,
        400
      );
    }

    const member = await loanRepository.findMemberBasic(loan.id_anggota, client);
    if (!member || member.status_akun !== ACCOUNT_STATUS.AKTIF) {
      throw new AppError('Akun anggota peminjam sudah tidak aktif', 400);
    }

    // FR-31 & NFR-06: Verifikasi ulang stok & kurangi stok secara atomik
    const book = await loanRepository.lockBookForUpdate(loan.id_buku, client);
    if (!book || !book.is_active) {
      throw new AppError('Buku sudah tidak aktif dan tidak dapat dipinjam', 400);
    }

    if (book.stok_tersedia < loan.jumlah) {
      throw new AppError(
        `Stok buku "${book.judul}" tidak mencukupi untuk disetujui (tersedia: ${book.stok_tersedia})`,
        400
      );
    }

    const tanggalPinjam = payload.tanggal_pinjam || getTodayDateString();
    const tanggalJatuhTempo =
      payload.tanggal_jatuh_tempo ||
      addDaysToDateString(tanggalPinjam, BUSINESS_RULES.DEFAULT_LOAN_DAYS);

    if (diffDaysBetweenDates(tanggalPinjam, tanggalJatuhTempo) < 0) {
      throw new AppError(
        'Tanggal jatuh tempo tidak boleh lebih awal dari tanggal pinjam',
        400
      );
    }

    await loanRepository.adjustBookStock(book.id_buku, -loan.jumlah, client);
    await loanRepository.updateLoanStatus(
      idPeminjaman,
      {
        status_peminjaman: LOAN_STATUS.DIPINJAM,
        tanggal_pinjam: tanggalPinjam,
        tanggal_jatuh_tempo: tanggalJatuhTempo,
        catatan: payload.catatan !== null ? payload.catatan : loan.catatan,
      },
      client
    );

    await client.query('COMMIT');
    return loanRepository.findById(idPeminjaman);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const rejectLoan = async (idPeminjaman, payload) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const loan = await loanRepository.findRawForUpdate(idPeminjaman, client);
    if (!loan) {
      throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
    }

    // FR-33 & FR-36: Hanya status DIAJUKAN yang dapat ditolak
    if (loan.status_peminjaman !== LOAN_STATUS.DIAJUKAN) {
      throw new AppError(
        `Transaksi berstatus ${loan.status_peminjaman} tidak dapat ditolak`,
        400
      );
    }

    await loanRepository.updateLoanStatus(
      idPeminjaman,
      {
        status_peminjaman: LOAN_STATUS.DITOLAK,
        catatan: payload.catatan !== null ? payload.catatan : loan.catatan,
      },
      client
    );

    await client.query('COMMIT');
    return loanRepository.findById(idPeminjaman);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const cancelLoan = async (idPeminjaman, payload, currentUser) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const loan = await loanRepository.findRawForUpdate(idPeminjaman, client);
    if (!loan) {
      throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
    }

    // FR-34: Anggota hanya dapat membatalkan pengajuan miliknya sendiri
    if (loan.id_anggota !== currentUser.id_anggota) {
      throw new AppError('Anda tidak memiliki akses untuk membatalkan pengajuan ini', 403);
    }

    // FR-34 & FR-36: Hanya dapat dibatalkan selama status masih DIAJUKAN
    if (loan.status_peminjaman !== LOAN_STATUS.DIAJUKAN) {
      throw new AppError(
        `Pengajuan berstatus ${loan.status_peminjaman} tidak dapat dibatalkan`,
        400
      );
    }

    await loanRepository.updateLoanStatus(
      idPeminjaman,
      {
        status_peminjaman: LOAN_STATUS.DIBATALKAN,
        catatan: payload.catatan !== null ? payload.catatan : loan.catatan,
      },
      client
    );

    await client.query('COMMIT');
    return loanRepository.findById(idPeminjaman);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const returnLoan = async (idPeminjaman, payload) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await loanRepository.syncOverdueLoans(client);

    const loan = await loanRepository.findRawForUpdate(idPeminjaman, client);
    if (!loan) {
      throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
    }

    // FR-35 & FR-36: Hanya DIPINJAM atau TERLAMBAT yang dapat dikembalikan
    if (
      loan.status_peminjaman !== LOAN_STATUS.DIPINJAM &&
      loan.status_peminjaman !== LOAN_STATUS.TERLAMBAT
    ) {
      throw new AppError(
        `Transaksi berstatus ${loan.status_peminjaman} tidak dapat diproses pengembaliannya`,
        400
      );
    }

    // FR-36: Validasi tanggal_kembali >= tanggal_pinjam
    if (loan.tanggal_pinjam && diffDaysBetweenDates(loan.tanggal_pinjam, payload.tanggal_kembali) < 0) {
      throw new AppError(
        `Tanggal kembali (${payload.tanggal_kembali}) tidak boleh lebih awal dari tanggal pinjam (${loan.tanggal_pinjam})`,
        400
      );
    }

    // NFR-06: Pulihkan stok_tersedia secara atomik
    await loanRepository.lockBookForUpdate(loan.id_buku, client);
    await loanRepository.adjustBookStock(loan.id_buku, loan.jumlah, client);

    await loanRepository.updateLoanStatus(
      idPeminjaman,
      {
        status_peminjaman: LOAN_STATUS.DIKEMBALIKAN,
        tanggal_kembali: payload.tanggal_kembali,
        catatan: payload.catatan !== null ? payload.catatan : loan.catatan,
      },
      client
    );

    // FR-37 & FR-40: Hitung keterlambatan dan buat catatan denda otomatis bila terlambat
    if (loan.tanggal_jatuh_tempo) {
      const hariTerlambat = Math.max(
        0,
        diffDaysBetweenDates(loan.tanggal_jatuh_tempo, payload.tanggal_kembali)
      );

      if (hariTerlambat > 0) {
        const tarifPerHari = BUSINESS_RULES.DEFAULT_FINE_PER_DAY;
        const totalDenda = hariTerlambat * tarifPerHari;

        await loanRepository.createAutoFine(
          {
            id_peminjaman: idPeminjaman,
            hari_terlambat: hariTerlambat,
            tarif_per_hari: tarifPerHari,
            total_denda: totalDenda,
            status_denda: FINE_STATUS.BELUM_LUNAS,
            keterangan: `Denda keterlambatan pengembalian otomatis (${hariTerlambat} hari)`,
          },
          client
        );
      }
    }

    await client.query('COMMIT');
    return loanRepository.findById(idPeminjaman);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteLoan = async (idPeminjaman) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const loan = await loanRepository.findRawForUpdate(idPeminjaman, client);
    if (!loan) {
      throw new AppError('Transaksi peminjaman tidak ditemukan', 404);
    }

    // FR-38: Hanya transaksi berstatus DITOLAK atau DIBATALKAN yang boleh dihapus
    if (
      loan.status_peminjaman !== LOAN_STATUS.DITOLAK &&
      loan.status_peminjaman !== LOAN_STATUS.DIBATALKAN
    ) {
      throw new AppError(
        `Transaksi berstatus ${loan.status_peminjaman} tidak dapat dihapus. Hanya transaksi DITOLAK atau DIBATALKAN yang dapat dihapus`,
        409
      );
    }

    const hasFine = await loanRepository.hasAssociatedFine(idPeminjaman, client);
    if (hasFine) {
      throw new AppError(
        'Transaksi peminjaman yang memiliki catatan denda tidak dapat dihapus',
        409
      );
    }

    const deleted = await loanRepository.removeLoan(idPeminjaman, client);
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  listLoans,
  getLoanById,
  createLoan,
  approveLoan,
  rejectLoan,
  cancelLoan,
  returnLoan,
  deleteLoan,
};
