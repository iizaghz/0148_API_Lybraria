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
let defaultBookId;
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

  const member1Auth = await loginAs(
    process.env.SEED_MEMBER_NIM || '2300018148',
    process.env.SEED_MEMBER_PASSWORD || 'Anggota123!'
  );
  member1Token = member1Auth.access_token;
  member1Id = member1Auth.user.id_anggota;

  const m2Res = await fetch(`${baseUrl}/api/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      nim: '2300077777',
      nama_lengkap: 'Anggota Kedua Test Fine',
      email: 'member2.fine@lybraria.ac.id',
      password: 'Password123!',
      program_studi: 'Informatika',
    }),
  });
  const m2Body = await m2Res.json();
  assert.equal(m2Res.status, 201);
  member2Id = m2Body.data.id_anggota;

  const member2Auth = await loginAs('2300077777', 'Password123!');
  member2Token = member2Auth.access_token;

  const bookRes = await db.query('SELECT id_buku FROM buku WHERE is_active = TRUE LIMIT 1');
  defaultBookId = bookRes.rows[0].id_buku;

  // Buat 2 transaksi peminjaman selesai tanpa denda untuk uji Create/Update/Pay/Delete denda korektif
  for (let i = 1; i <= 2; i += 1) {
    const loanInsert = await db.query(
      `
        INSERT INTO peminjaman (
          kode_peminjaman, id_anggota, id_buku, jumlah, tanggal_pengajuan,
          tanggal_pinjam, tanggal_jatuh_tempo, tanggal_kembali, status_peminjaman
        )
        VALUES ($1, $2, $3, 1, '2026-11-01', '2026-11-01', '2026-11-08', '2026-11-10', 'DIKEMBALIKAN')
        RETURNING id_peminjaman
      `,
      [`PJM-FINE-TEST-0${i}`, member1Id, defaultBookId]
    );
    tempLoanIds.push(loanInsert.rows[0].id_peminjaman);
  }
});

after(async () => {
  if (tempLoanIds.length > 0) {
    await db.query('DELETE FROM denda WHERE id_peminjaman = ANY($1::int[])', [tempLoanIds]);
    await db.query('DELETE FROM peminjaman WHERE id_peminjaman = ANY($1::int[])', [tempLoanIds]);
  }
  if (member2Id) {
    await db.query('DELETE FROM anggota WHERE id_anggota = $1', [member2Id]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

describe('Late Fine Management CRUDS (FR-40 s/d FR-46) & Dashboard Summary', () => {
  let fineId1;
  let fineId2;

  it('FR-40 & FR-41: Admin membuat denda korektif, menolak nilai negatif (400) & duplikasi id_peminjaman (409)', async () => {
    // Nilai negatif ditolak 400
    const negRes = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: tempLoanIds[0],
        hari_terlambat: -2,
        tarif_per_hari: 1000,
      }),
    });
    assert.equal(negRes.status, 400);

    // Valid create (otomatis hitung total_denda = 2 * 1000 = 2000)
    const createRes = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: tempLoanIds[0],
        hari_terlambat: 2,
        keterangan: 'Denda korektif 2 hari',
      }),
    });
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createBody.data.hari_terlambat, 2);
    assert.equal(Number(createBody.data.tarif_per_hari), 1000);
    assert.equal(Number(createBody.data.total_denda), 2000);
    assert.equal(createBody.data.status_denda, 'BELUM_LUNAS');
    fineId1 = createBody.data.id_denda;

    // Duplicate id_peminjaman -> 409
    const dupRes = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: tempLoanIds[0],
        hari_terlambat: 1,
      }),
    });
    assert.equal(dupRes.status, 409);

    // Buat denda ke-2 untuk uji hapus catatan korektif BELUM_LUNAS
    const create2 = await fetch(`${baseUrl}/api/fines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_peminjaman: tempLoanIds[1],
        hari_terlambat: 4,
        keterangan: 'Salah input korektif',
      }),
    });
    assert.equal(create2.status, 201);
    fineId2 = (await create2.json()).data.id_denda;
  });

  it('FR-42, FR-45, FR-46: Isolasi baca/cari denda Anggota & larangan pembayaran/mutasi oleh Anggota (403)', async () => {
    // Member1 melihat denda pribadinya
    const ownList = await fetch(`${baseUrl}/api/fines?status_denda=BELUM_LUNAS`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const ownListBody = await ownList.json();
    assert.equal(ownList.status, 200);
    assert.ok(ownListBody.data.some((f) => f.id_denda === fineId1));

    // Member2 tidak boleh membaca detail denda milik member1 (403)
    const otherDetail = await fetch(`${baseUrl}/api/fines/${fineId1}`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    assert.equal(otherDetail.status, 403);

    // FR-46: Anggota tidak bisa melunasi denda sendiri secara daring (403)
    const memberPay = await fetch(`${baseUrl}/api/fines/${fineId1}/pay`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${member1Token}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(memberPay.status, 403);

    // FR-45: Admin mencari denda berdasarkan kode_peminjaman & NIM
    const adminSearch = await fetch(`${baseUrl}/api/fines?q=PJM-FINE-TEST-01`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminSearchBody = await adminSearch.json();
    assert.equal(adminSearch.status, 200);
    assert.equal(adminSearchBody.data.length, 1);
  });

  it('FR-41, FR-43, FR-44: Koreksi denda, pelunasan tunai (LUNAS), tolak hapus LUNAS (409), & hapus korektif BELUM_LUNAS (200)', async () => {
    // Update nilai negatif ditolak 400
    const negUpdate = await fetch(`${baseUrl}/api/fines/${fineId1}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ total_denda: -500 }),
    });
    assert.equal(negUpdate.status, 400);

    // Koreksi hari_terlambat -> 3 hari (otomatis total_denda jadi 3000)
    const corrRes = await fetch(`${baseUrl}/api/fines/${fineId1}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        hari_terlambat: 3,
        keterangan: 'Koreksi menjadi 3 hari terlambat',
      }),
    });
    const corrBody = await corrRes.json();
    assert.equal(corrRes.status, 200);
    assert.equal(Number(corrBody.data.total_denda), 3000);

    // Pelunasan tunai di perpustakaan -> LUNAS
    const payRes = await fetch(`${baseUrl}/api/fines/${fineId1}/pay`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ tanggal_bayar: '2026-11-27', keterangan: 'Dibayar tunai di loket' }),
    });
    const payBody = await payRes.json();
    assert.equal(payRes.status, 200);
    assert.equal(payBody.data.status_denda, 'LUNAS');
    assert.equal(payBody.data.tanggal_bayar, '2026-11-27');

    // Pelunasan ulang ditolak 400
    const doublePay = await fetch(`${baseUrl}/api/fines/${fineId1}/pay`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(doublePay.status, 400);

    // FR-44: Denda LUNAS tidak boleh dihapus (409)
    const delPaid = await fetch(`${baseUrl}/api/fines/${fineId1}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delPaid.status, 409);

    // FR-44: Denda korektif BELUM_LUNAS boleh dihapus (200)
    const delUnpaid = await fetch(`${baseUrl}/api/fines/${fineId2}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delUnpaid.status, 200);
  });

  it('Dashboard Summary (SRS 4.1): Admin mendapatkan ringkasan statistik (200) dan Anggota ditolak (403)', async () => {
    const memberDash = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    assert.equal(memberDash.status, 403);

    const adminDash = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const body = await adminDash.json();
    assert.equal(adminDash.status, 200);
    assert.equal(typeof body.data.total_buku_aktif, 'number');
    assert.equal(typeof body.data.total_kategori, 'number');
    assert.equal(typeof body.data.total_anggota_aktif, 'number');
    assert.equal(typeof body.data.peminjaman_diajukan, 'number');
    assert.equal(typeof body.data.denda_belum_lunas_count, 'number');
    assert.equal(typeof body.data.denda_belum_lunas_nominal, 'number');
  });
});
