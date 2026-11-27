require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let adminToken;
let tempMemberId;
let tempBookId;
const tempLoanIds = [];

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

  const catRes = await db.query('SELECT id_kategori FROM kategori LIMIT 1');
  const bookRes = await fetch(`${baseUrl}/api/books`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      id_kategori: catRes.rows[0].id_kategori,
      kode_buku: 'BK-EDGE-TEST-01',
      judul: 'Buku Uji Edge Cases',
      penulis: 'Auditor',
      penerbit: 'Lybraria Press',
      tahun_terbit: 2026,
      stok_total: 4,
    }),
  });
  assert.equal(bookRes.status, 201);
  tempBookId = (await bookRes.json()).data.id_buku;

  const memRes = await fetch(`${baseUrl}/api/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      nim: '2300066666',
      nama_lengkap: 'Anggota Edge Test',
      email: 'edge.member@lybraria.ac.id',
      password: 'OldPassword123!',
      program_studi: 'Informatika',
    }),
  });
  assert.equal(memRes.status, 201);
  tempMemberId = (await memRes.json()).data.id_anggota;
});

after(async () => {
  if (tempLoanIds.length > 0) {
    await db.query('DELETE FROM denda WHERE id_peminjaman = ANY($1::int[])', [tempLoanIds]);
    await db.query('DELETE FROM peminjaman WHERE id_peminjaman = ANY($1::int[])', [tempLoanIds]);
  }
  if (tempBookId) {
    await db.query('DELETE FROM buku WHERE id_buku = $1', [tempBookId]);
  }
  if (tempMemberId) {
    await db.query('DELETE FROM anggota WHERE id_anggota = $1', [tempMemberId]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

describe('Deep Bug Regression & Security Hardening Tests', () => {
  it('Menolak koersi boolean/null/whitespace & overflow INT4/NUMERIC (400, bukan 500 atau 0)', async () => {
    // Overflow INT4 pada path ID -> 400 (bukan 500 PG 22003)
    const overflowId = await fetch(`${baseUrl}/api/books/999999999999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(overflowId.status, 400);

    // PATCH stok_total: null atau false tidak boleh diam-diam jadi 0 -> 400
    const nullStock = await fetch(`${baseUrl}/api/books/${tempBookId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ stok_total: null }),
    });
    assert.equal(nullStock.status, 400);

    const boolStock = await fetch(`${baseUrl}/api/books/${tempBookId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ stok_total: false }),
    });
    assert.equal(boolStock.status, 400);

    // Pastikan stok buku tetap 4
    const checkBook = await fetch(`${baseUrl}/api/books/${tempBookId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal((await checkBook.json()).data.stok_total, 4);

    // Boolean id_buku pada loan create -> 400
    const boolLoan = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ id_anggota: tempMemberId, id_buku: true, jumlah: true }),
    });
    assert.equal(boolLoan.status, 400);
  });

  it('ILIKE escape: pencarian wildcard "%" tidak mencocokkan seluruh katalog buku', async () => {
    const res = await fetch(`${baseUrl}/api/books?q=%25`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.data.length, 0);
  });

  it('Denda korektif tidak boleh dibuat untuk DIAJUKAN, dan denda yang sudah ada tidak menggagalkan return terlambat + tipe numerik', async () => {
    const memberAuth = await loginAs('2300066666', 'OldPassword123!');

    // 1. Buat pengajuan DIAJUKAN -> coba buat denda korektif harus ditolak 400
    const pendingRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberAuth.access_token}`,
      },
      body: JSON.stringify({ id_buku: tempBookId, jumlah: 1 }),
    });
    const pendingId = (await pendingRes.json()).data.id_peminjaman;
    tempLoanIds.push(pendingId);

    const fineOnPending = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ id_peminjaman: pendingId, hari_terlambat: 2 }),
    });
    assert.equal(fineOnPending.status, 400);

    // 2. Buat pinjaman langsung jatuh tempo lampau, buat denda korektif dulu, lalu return terlambat -> tetap 200!
    const lateLoanRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_anggota: tempMemberId,
        id_buku: tempBookId,
        jumlah: 1,
        tanggal_pinjam: '2026-11-10',
        tanggal_jatuh_tempo: '2026-11-17',
      }),
    });
    const lateLoanId = (await lateLoanRes.json()).data.id_peminjaman;
    tempLoanIds.push(lateLoanId);

    // Overflow NUMERIC(10,2) pada denda -> 400
    const overflowFine = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: lateLoanId,
        hari_terlambat: 1,
        total_denda: 9999999999,
      }),
    });
    assert.equal(overflowFine.status, 400);

    // Buat denda korektif sebelum return
    const preFineRes = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: lateLoanId,
        hari_terlambat: 2,
        keterangan: 'Denda dicatat sebelum pengembalian',
      }),
    });
    const preFineBody = await preFineRes.json();
    assert.equal(preFineRes.status, 201);
    assert.equal(typeof preFineBody.data.total_denda, 'number');
    assert.equal(typeof preFineBody.data.tarif_per_hari, 'number');

    // Return terlambat tidak boleh error 409 duplikasi denda
    const returnRes = await fetch(`${baseUrl}/api/loans/${lateLoanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-22' }),
    });
    const returnBody = await returnRes.json();
    assert.equal(returnRes.status, 200);
    assert.equal(returnBody.data.status_peminjaman, 'DIKEMBALIKAN');
    assert.equal(typeof returnBody.data.total_denda, 'number');
    assert.equal(returnBody.data.total_denda, 2000);
  });

  it('Reset password anggota oleh Admin otomatis merevokasi sesi lama anggota tersebut', async () => {
    const memberAuth = await loginAs('2300066666', 'OldPassword123!');

    // Sesi lama valid sebelum reset
    const beforeReset = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${memberAuth.access_token}` },
    });
    assert.equal(beforeReset.status, 200);

    // Admin mereset password anggota
    const resetRes = await fetch(`${baseUrl}/api/members/${tempMemberId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ password: 'NewPassword456!' }),
    });
    assert.equal(resetRes.status, 200);

    // Sesi lama langsung ditolak 401
    const afterReset = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${memberAuth.access_token}` },
    });
    assert.equal(afterReset.status, 401);
  });

  it('Keamanan JWT & bcrypt: Refresh token ditolak di Authorization Bearer, rotasi paralel hanya 1 sukses, & password >72 char ditolak', async () => {
    // Password > 72 karakter ditolak 400
    const longPwRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '2300066666', password: 'A'.repeat(100) }),
    });
    assert.equal(longPwRes.status, 400);

    // Login pakai password baru dari test sebelumnya
    const memberAuth = await loginAs('2300066666', 'NewPassword456!');

    // Refresh token dipakai sebagai Bearer access token harus ditolak 401
    const confusedRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${memberAuth.refresh_token}` },
    });
    assert.equal(confusedRes.status, 401);

    // 2 request refresh paralel dengan token sama -> tepat 1 sukses (200) dan 1 gagal (401)
    const [r1, r2] = await Promise.all([
      fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: memberAuth.refresh_token }),
      }),
      fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: memberAuth.refresh_token }),
      }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    assert.deepEqual(statuses, [200, 401]);
  });

  it('Tanggal kembali ekstrem yang membuat auto-denda melampaui NUMERIC(10,2) ditolak bersih (400, bukan 500)', async () => {
    const loanRes = await fetch(`${baseUrl}/api/loans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_anggota: tempMemberId,
        id_buku: tempBookId,
        jumlah: 1,
        tanggal_pinjam: '2026-11-01',
        tanggal_jatuh_tempo: '2026-11-08',
      }),
    });
    const loanId = (await loanRes.json()).data.id_peminjaman;
    tempLoanIds.push(loanId);

    const extremeReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2999-12-31' }),
    });
    assert.equal(extremeReturn.status, 400);

    // Kembalikan dengan tanggal normal agar stok buku pulih bersih
    const normalReturn = await fetch(`${baseUrl}/api/loans/${loanId}/return`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_kembali: '2026-11-05' }),
    });
    assert.equal(normalReturn.status, 200);
  });
});
