require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let adminToken;
let adminId;
let memberToken;
let createdMemberId;
let tempLoanId;
let tempFineId;
let defaultBookId;

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
  adminId = adminAuth.user.id_anggota;

  const memberAuth = await loginAs(
    process.env.SEED_MEMBER_NIM || '2300018148',
    process.env.SEED_MEMBER_PASSWORD || 'Anggota123!'
  );
  memberToken = memberAuth.access_token;

  const bookRes = await db.query('SELECT id_buku FROM buku WHERE is_active = TRUE LIMIT 1');
  defaultBookId = bookRes.rows[0].id_buku;
});

after(async () => {
  if (tempFineId) {
    await db.query('DELETE FROM denda WHERE id_denda = $1', [tempFineId]);
  }
  if (tempLoanId) {
    await db.query('DELETE FROM peminjaman WHERE id_peminjaman = $1', [tempLoanId]);
  }
  if (createdMemberId) {
    await db.query('DELETE FROM anggota WHERE id_anggota = $1', [createdMemberId]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

describe('Member Management CRUDS (FR-22 s/d FR-28)', () => {
  it('Menolak akses tanpa token (401) & Anggota hanya boleh akses profil pribadi (/me), ditolak (403) pada menu kelola anggota', async () => {
    const unauth = await fetch(`${baseUrl}/api/members/me`);
    assert.equal(unauth.status, 401);

    const meRes = await fetch(`${baseUrl}/api/members/me`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const meBody = await meRes.json();
    assert.equal(meRes.status, 200);
    assert.equal(meBody.data.role, 'ANGGOTA');
    assert.equal(meBody.data.password_hash, undefined);
    assert.equal(meBody.data.refresh_token_hash, undefined);
    assert.equal(typeof meBody.data.jumlah_peminjaman_aktif, 'number');

    const listAsMember = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(listAsMember.status, 403);

    const createAsMember = await fetch(`${baseUrl}/api/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(createAsMember.status, 403);
  });

  it('FR-22 & FR-27: Admin mendaftarkan Anggota baru, validasi input/duplikat, tanpa membocorkan data sensitif', async () => {
    // Invalid payload
    const badRes = await fetch(`${baseUrl}/api/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nim: '',
        nama_lengkap: '',
        email: 'bukan-email',
        password: '123',
      }),
    });
    assert.equal(badRes.status, 400);

    // Valid create
    const createRes = await fetch(`${baseUrl}/api/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nim: '2300099999',
        nama_lengkap: 'Siti Rahmawati Test',
        email: 'siti.test@lybraria.ac.id',
        password: 'Password123!',
        program_studi: 'Sistem Informasi',
        no_telepon: '081234567890',
      }),
    });
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createBody.data.nim, '2300099999');
    assert.equal(createBody.data.role, 'ANGGOTA');
    assert.equal(createBody.data.status_akun, 'AKTIF');
    assert.equal(createBody.data.password_hash, undefined);
    assert.equal(createBody.data.refresh_token_hash, undefined);
    createdMemberId = createBody.data.id_anggota;

    // Duplicate NIM -> 409
    const dupNim = await fetch(`${baseUrl}/api/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nim: '2300099999',
        nama_lengkap: 'Duplikat NIM',
        email: 'other@lybraria.ac.id',
        password: 'Password123!',
      }),
    });
    assert.equal(dupNim.status, 409);

    // Duplicate email -> 409
    const dupEmail = await fetch(`${baseUrl}/api/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nim: '2300099998',
        nama_lengkap: 'Duplikat Email',
        email: 'SITI.TEST@lybraria.ac.id',
        password: 'Password123!',
      }),
    });
    assert.equal(dupEmail.status, 409);

    // Anggota baru bisa langsung login dengan NIM
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '2300099999', password: 'Password123!' }),
    });
    assert.equal(loginRes.status, 200);
  });

  it('FR-23 & FR-26: Admin melihat daftar/detail dan mencari anggota berdasarkan NIM, nama, email, program studi', async () => {
    const listRes = await fetch(`${baseUrl}/api/members`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listBody = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.ok(listBody.data.every((m) => m.role === 'ANGGOTA'));
    assert.ok(listBody.data.every((m) => m.password_hash === undefined && m.refresh_token_hash === undefined));

    const searchByNim = await fetch(`${baseUrl}/api/members?q=2300099999`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchNimBody = await searchByNim.json();
    assert.equal(searchByNim.status, 200);
    assert.equal(searchNimBody.data.length, 1);

    const searchByProdi = await fetch(`${baseUrl}/api/members?q=Sistem%20Informasi`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const searchProdiBody = await searchByProdi.json();
    assert.equal(searchByProdi.status, 200);
    assert.ok(searchProdiBody.data.some((m) => m.id_anggota === createdMemberId));

    const detailRes = await fetch(`${baseUrl}/api/members/${createdMemberId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const detailBody = await detailRes.json();
    assert.equal(detailRes.status, 200);
    assert.equal(detailBody.data.id_anggota, createdMemberId);
    assert.equal(typeof detailBody.data.jumlah_peminjaman_aktif, 'number');
  });

  it('FR-24 & FR-28: Admin update profil anggota & dicegah menonaktifkan/menghapus akun Admin sendiri', async () => {
    const updateRes = await fetch(`${baseUrl}/api/members/${createdMemberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_lengkap: 'Siti Rahmawati Updated',
        program_studi: 'Teknik Informatika',
      }),
    });
    const updateBody = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updateBody.data.nama_lengkap, 'Siti Rahmawati Updated');
    assert.equal(updateBody.data.program_studi, 'Teknik Informatika');

    // FR-28: Self-deactivate via PATCH ditolak 400
    const selfDeactivateRes = await fetch(`${baseUrl}/api/members/${adminId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status_akun: 'NONAKTIF' }),
    });
    assert.equal(selfDeactivateRes.status, 400);

    // FR-28: Self-delete via DELETE ditolak 400
    const selfDeleteRes = await fetch(`${baseUrl}/api/members/${adminId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(selfDeleteRes.status, 400);
  });

  it('FR-25: Delete ditolak jika ada peminjaman aktif atau denda BELUM_LUNAS, lalu soft-delete saat tanggungan selesai', async () => {
    // 1. Simulasikan peminjaman aktif (DIPINJAM)
    const loanInsert = await db.query(
      `
        INSERT INTO peminjaman (
          kode_peminjaman, id_anggota, id_buku, jumlah, tanggal_pengajuan,
          tanggal_pinjam, tanggal_jatuh_tempo, status_peminjaman
        )
        VALUES ('PJM-TEST-MEM-001', $1, $2, 1, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 7, 'DIPINJAM')
        RETURNING id_peminjaman
      `,
      [createdMemberId, defaultBookId]
    );
    tempLoanId = loanInsert.rows[0].id_peminjaman;

    const delWhileBorrowed = await fetch(`${baseUrl}/api/members/${createdMemberId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delWhileBorrowed.status, 409);

    // 2. Ubah peminjaman jadi DIKEMBALIKAN, tapi tambahkan denda BELUM_LUNAS
    await db.query(
      "UPDATE peminjaman SET status_peminjaman = 'DIKEMBALIKAN', tanggal_kembali = CURRENT_DATE WHERE id_peminjaman = $1",
      [tempLoanId]
    );
    const fineInsert = await db.query(
      `
        INSERT INTO denda (id_peminjaman, hari_terlambat, tarif_per_hari, total_denda, status_denda)
        VALUES ($1, 3, 1000.00, 3000.00, 'BELUM_LUNAS')
        RETURNING id_denda
      `,
      [tempLoanId]
    );
    tempFineId = fineInsert.rows[0].id_denda;

    const delWhileUnpaidFine = await fetch(`${baseUrl}/api/members/${createdMemberId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delWhileUnpaidFine.status, 409);

    // 3. Lunasi denda -> soft-delete berhasil (status_akun = NONAKTIF)
    await db.query(
      "UPDATE denda SET status_denda = 'LUNAS', tanggal_bayar = CURRENT_DATE WHERE id_denda = $1",
      [tempFineId]
    );

    const softDelRes = await fetch(`${baseUrl}/api/members/${createdMemberId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const softDelBody = await softDelRes.json();
    assert.equal(softDelRes.status, 200);
    assert.equal(softDelBody.data.status_akun, 'NONAKTIF');

    // Akun NONAKTIF tidak bisa login lagi (403)
    const loginBlocked = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '2300099999', password: 'Password123!' }),
    });
    assert.equal(loginBlocked.status, 403);
  });
});
