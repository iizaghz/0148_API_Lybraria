require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let adminToken;
let member1Token;
let member1Id;
let member2Token;
let member2Id;
let testBookId;
const createdLoanIds = [];

const loginAs = async (identifier, password) => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `Gagal login untuk ${identifier}`);
  return body.data;
};

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const adminAuth = await loginAs(
    process.env.SEED_ADMIN_EMAIL || 'admin@lybraria.ac.id',
    process.env.SEED_ADMIN_PASSWORD || 'Admin123!'
  );
  adminToken = adminAuth.access_token;

  const member1Auth = await loginAs(
    process.env.SEED_MEMBER_NIM || '2300018148',
    process.env.SEED_MEMBER_PASSWORD || 'Anggota123!'
  );
  member1Token = member1Auth.access_token;
  member1Id = member1Auth.user.id_anggota;

  // Buat anggota ke-2 sementara untuk uji isolasi data NFR-12 / FR-32
  const m2Res = await fetch(`${baseUrl}/api/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      nim: '2300088888',
      nama_lengkap: 'Anggota Kedua Test Loan',
      email: 'member2.loan@lybraria.ac.id',
      password: 'Password123!',
      program_studi: 'Informatika',
    }),
  });
  const m2Body = await m2Res.json();
  assert.equal(m2Res.status, 201);
  member2Id = m2Body.data.id_anggota;

  const member2Auth = await loginAs('2300088888', 'Password123!');
  member2Token = member2Auth.access_token;

  // Buat buku khusus testing sirkulasi dengan stok_total = 3
  const catRes = await db.query('SELECT id_kategori FROM kategori LIMIT 1');
  const bookRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      id_kategori: catRes.rows[0].id_kategori,
      kode_buku: 'BK-LOAN-TEST-01',
      judul: 'Buku Uji Sirkulasi Lybraria',
      penulis: 'Penulis Uji',
      penerbit: 'Penerbit Uji',
      tahun_terbit: 2026,
      stok_total: 3,
    }),
  });
  const bookBody = await bookRes.json();
  assert.equal(bookRes.status, 201);
  testBookId = bookBody.data.id_buku;
});

after(async () => {
  if (createdLoanIds.length > 0) {
    await db.query('DELETE FROM denda WHERE id_peminjaman = ANY($1::int[])', [createdLoanIds]);
    await db.query('DELETE FROM peminjaman WHERE id_peminjaman = ANY($1::int[])', [createdLoanIds]);
  }
  if (testBookId) {
    await db.query('DELETE FROM buku WHERE id_buku = $1', [testBookId]);
  }
  if (member2Id) {
    await db.query('DELETE FROM anggota WHERE id_anggota = $1', [member2Id]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

const getBookStock = async (bookId) => {
  const res = await db.query('SELECT stok_tersedia FROM buku WHERE id_buku = $1', [bookId]);
  return res.rows[0].stok_tersedia;
};

describe('Borrowing & Return Management CRUDS (FR-29 s/d FR-39)', () => {
  it('FR-29, FR-31, FR-34, FR-38: Pengajuan Anggota, tolak melebihi stok, batalkan, & hapus DIBATALKAN', async () => {
    // Melebihi stok (stok 3, minta 5) -> 400
    const overRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ id_buku: testBookId, jumlah: 5 }),
    });
    assert.equal(overRes.status, 400);

    // Pengajuan valid -> status DIAJUKAN, stok belum berkurang
    const reqRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ id_buku: testBookId, jumlah: 1, catatan: 'Untuk tugas kuliah' }),
    });
    const reqBody = await reqRes.json();
    assert.equal(reqRes.status, 201);
    assert.equal(reqBody.data.status_peminjaman, 'DIAJUKAN');
    assert.equal(await getBookStock(testBookId), 3);
    const loanId = reqBody.data.id_peminjaman;
    createdLoanIds.push(loanId);

    // Anggota lain tidak boleh membatalkan pengajuan milik member1 (403)
    const otherCancel = await fetch(`${baseUrl}/api/loans/${loanId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member2Token}`,
      },
      body: JSON.stringify({ catatan: 'Batal paksa' }),
    });
    assert.equal(otherCancel.status, 403);

    // Admin tidak boleh menghapus transaksi berstatus DIAJUKAN (409)
    const delActive = await fetch(`${baseUrl}/api/loans/${loanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delActive.status, 409);

    // Pemilik membatalkan -> DIBATALKAN
    const cancelRes = await fetch(`${baseUrl}/api/loans/${loanId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ catatan: 'Tidak jadi pinjam' }),
    });
    const cancelBody = await cancelRes.json();
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelBody.data.status_peminjaman, 'DIBATALKAN');

    // Admin menghapus transaksi berstatus DIBATALKAN -> 200
    const delCancelled = await fetch(`${baseUrl}/api/loans/${loanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delCancelled.status, 200);
  });

  it('FR-33 & FR-38: Admin menolak pengajuan (DITOLAK) tanpa ubah stok & dapat menghapusnya', async () => {
    const reqRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ id_buku: testBookId, jumlah: 1 }),
    });
    const loanId = (await reqRes.json()).data.id_peminjaman;
    createdLoanIds.push(loanId);

    const rejectRes = await fetch(`${baseUrl}/api/loans/${loanId}/reject`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ catatan: 'Buku sedang disiapkan untuk ujian' }),
    });
    const rejectBody = await rejectRes.json();
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectBody.data.status_peminjaman, 'DITOLAK');
    assert.equal(await getBookStock(testBookId), 3);

    const delRejected = await fetch(`${baseUrl}/api/loans/${loanId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRejected.status, 200);
  });

  it('FR-33, FR-35, FR-36, NFR-06: Persetujuan atomik kurangi stok, tolak tanggal/status tidak sah, & pengembalian tepat waktu pulihkan stok', async () => {
    const reqRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({ id_buku: testBookId, jumlah: 2 }),
    });
    const loanId = (await reqRes.json()).data.id_peminjaman;
    createdLoanIds.push(loanId);

    // FR-36: Tidak boleh mengembalikan transaksi berstatus DIAJUKAN
    const badReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-27' }),
    });
    assert.equal(badReturn.status, 400);

    // FR-33: Admin menyetujui -> DIPINJAM, stok 3 -> 1
    const approveRes = await fetch(`${baseUrl}/api/loans/${loanId}/approve`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_pinjam: '2026-11-20', tanggal_jatuh_tempo: '2026-11-27' }),
    });
    const approveBody = await approveRes.json();
    assert.equal(approveRes.status, 200);
    assert.equal(approveBody.data.status_peminjaman, 'DIPINJAM');
    assert.equal(approveBody.data.tanggal_pinjam, '2026-11-20');
    assert.equal(approveBody.data.tanggal_jatuh_tempo, '2026-11-27');
    assert.equal(await getBookStock(testBookId), 1);

    // FR-34/FR-36: Anggota tidak bisa batalkan setelah DIPINJAM
    const lateCancel = await fetch(`${baseUrl}/api/loans/${loanId}/cancel`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(lateCancel.status, 400);

    // FR-36: Tanggal kembali lebih awal daripada tanggal pinjam -> 400
    const earlierReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-19' }),
    });
    assert.equal(earlierReturn.status, 400);

    // FR-35: Pengembalian tepat waktu (2026-11-25 <= 2026-11-27) -> stok pulih 1 -> 3, tanpa denda
    const returnRes = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-25', catatan: 'Kondisi baik' }),
    });
    const returnBody = await returnRes.json();
    assert.equal(returnRes.status, 200);
    assert.equal(returnBody.data.status_peminjaman, 'DIKEMBALIKAN');
    assert.equal(returnBody.data.id_denda, null);
    assert.equal(await getBookStock(testBookId), 3);

    // FR-36: Mengembalikan ulang transaksi DIKEMBALIKAN -> 400
    const doubleReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-26' }),
    });
    assert.equal(doubleReturn.status, 400);
  });

  it('FR-30, FR-37, FR-40: Peminjaman langsung Admin, deteksi TERLAMBAT otomatis, & pembuatan denda otomatis saat terlambat', async () => {
    // Buat peminjaman langsung dengan jatuh tempo lampau (2026-11-20)
    const directRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_anggota: member1Id,
        id_buku: testBookId,
        jumlah: 1,
        tanggal_pinjam: '2026-11-13',
        tanggal_jatuh_tempo: '2026-11-20',
      }),
    });
    const directBody = await directRes.json();
    assert.equal(directRes.status, 201);
    assert.equal(directBody.data.status_peminjaman, 'DIPINJAM');
    assert.equal(await getBookStock(testBookId), 2);
    const loanId = directBody.data.id_peminjaman;
    createdLoanIds.push(loanId);

    // FR-37: Membaca detail transaksi otomatis mendeteksi status TERLAMBAT
    const checkOverdue = await fetch(`${baseUrl}/api/loans/${loanId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const overdueBody = await checkOverdue.json();
    assert.equal(checkOverdue.status, 200);
    assert.equal(overdueBody.data.status_peminjaman, 'TERLAMBAT');

    // FR-32 & NFR-12: Anggota kedua ditolak (403) melihat transaksi milik member1
    const otherRead = await fetch(`${baseUrl}/api/loans/${loanId}`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    assert.equal(otherRead.status, 403);

    // FR-39: Admin mencari transaksi berdasarkan kode_peminjaman & status TERLAMBAT
    const searchRes = await fetch(
      `${baseUrl}/api/loans?q=${encodeURIComponent(directBody.data.kode_peminjaman)}&status_peminjaman=TERLAMBAT`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const searchBody = await searchRes.json();
    assert.equal(searchRes.status, 200);
    assert.equal(searchBody.data.length, 1);

    // FR-35 & FR-40: Kembalikan terlambat 3 hari (2026-11-23 > 2026-11-20) -> denda otomatis Rp3.000
    const lateReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-23' }),
    });
    const lateReturnBody = await lateReturn.json();
    assert.equal(lateReturn.status, 200);
    assert.equal(lateReturnBody.data.status_peminjaman, 'DIKEMBALIKAN');
    assert.ok(lateReturnBody.data.id_denda, 'Denda harus otomatis dibuat');
    assert.equal(lateReturnBody.data.hari_terlambat, 3);
    assert.equal(Number(lateReturnBody.data.total_denda), 3000);
    assert.equal(lateReturnBody.data.status_denda, 'BELUM_LUNAS');
    assert.equal(await getBookStock(testBookId), 3);
  });
});
