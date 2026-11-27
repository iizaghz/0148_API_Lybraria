require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let adminToken;
let memberToken;
let memberId;
let defaultCategoryId;
let createdBookId;
let tempLoanId;

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

  const memberAuth = await loginAs(
    process.env.SEED_MEMBER_NIM || '2300018148',
    process.env.SEED_MEMBER_PASSWORD || 'Anggota123!'
  );
  memberToken = memberAuth.access_token;
  memberId = memberAuth.user.id_anggota;

  const catRes = await db.query(
    "SELECT id_kategori FROM kategori WHERE nama_kategori = 'Teknologi Informasi' LIMIT 1"
  );
  defaultCategoryId = catRes.rows[0].id_kategori;
});

after(async () => {
  if (tempLoanId) {
    await db.query('DELETE FROM peminjaman WHERE id_peminjaman = $1', [tempLoanId]);
  }
  if (createdBookId) {
    await db.query('DELETE FROM buku WHERE id_buku = $1', [createdBookId]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

describe('Book Management CRUDS (FR-09 s/d FR-14)', () => {
  it('Menolak akses tanpa token (HTTP 401)', async () => {
    const res = await fetch(`${baseUrl}/api/books`);
    assert.equal(res.status, 401);
  });

  it('FR-11: Anggota dan Admin dapat membaca daftar katalog buku aktif beserta nama_kategori', async () => {
    const res = await fetch(`${baseUrl}/api/books`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data) && body.data.length >= 3);
    assert.ok(body.data[0].nama_kategori, 'Harus menyertakan nama_kategori');

    const detailRes = await fetch(`${baseUrl}/api/books/${body.data[0].id_buku}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const detailBody = await detailRes.json();
    assert.equal(detailRes.status, 200);
    assert.equal(detailBody.data.id_buku, body.data[0].id_buku);
  });

  it('FR-14: Pencarian berdasarkan judul, penulis, kode_buku, ISBN, dan filter kategori', async () => {
    const byJudul = await fetch(`${baseUrl}/api/books?q=Clean%20Code`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const byJudulBody = await byJudul.json();
    assert.equal(byJudul.status, 200);
    assert.ok(byJudulBody.data.some((b) => b.kode_buku === 'BK-TI-001'));

    const byPenulis = await fetch(`${baseUrl}/api/books?q=Kleppmann`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const byPenulisBody = await byPenulis.json();
    assert.equal(byPenulis.status, 200);
    assert.ok(byPenulisBody.data.some((b) => b.kode_buku === 'BK-TI-002'));

    const byIsbn = await fetch(`${baseUrl}/api/books?q=978-1285740621`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const byIsbnBody = await byIsbn.json();
    assert.equal(byIsbn.status, 200);
    assert.ok(byIsbnBody.data.some((b) => b.kode_buku === 'BK-SM-001'));

    const byCat = await fetch(`${baseUrl}/api/books?id_kategori=${defaultCategoryId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const byCatBody = await byCat.json();
    assert.equal(byCat.status, 200);
    assert.ok(byCatBody.data.every((b) => b.id_kategori === defaultCategoryId));
  });

  it('RBAC: Anggota ditolak (HTTP 403) pada Create, Update, dan Delete buku', async () => {
    const postRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.equal(postRes.status, 403);

    const putRes = await fetch(`${baseUrl}/api/books/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({ judul: 'Ilegal' }),
    });
    assert.equal(putRes.status, 403);

    const delRes = await fetch(`${baseUrl}/api/books/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(delRes.status, 403);
  });

  it('FR-09 & FR-10: Validasi kolom wajib, stok negatif, stok_tersedia > stok_total, dan duplikasi kode/ISBN', async () => {
    // Negative stock
    const negRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_kategori: defaultCategoryId,
        kode_buku: 'BK-TEST-NEG',
        judul: 'Buku Negatif',
        penulis: 'Penulis Test',
        penerbit: 'Penerbit Test',
        tahun_terbit: 2024,
        stok_total: -1,
      }),
    });
    assert.equal(negRes.status, 400);

    // stok_tersedia > stok_total
    const overRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_kategori: defaultCategoryId,
        kode_buku: 'BK-TEST-OVER',
        judul: 'Buku Over',
        penulis: 'Penulis Test',
        penerbit: 'Penerbit Test',
        tahun_terbit: 2024,
        stok_total: 2,
        stok_tersedia: 3,
      }),
    });
    assert.equal(overRes.status, 400);

    // Valid create (stok_tersedia otomatis sama dengan stok_total)
    const createRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_kategori: defaultCategoryId,
        kode_buku: 'BK-TEST-999',
        isbn: '978-6020000999',
        judul: 'Arsitektur Android Modern',
        penulis: 'Tim Lybraria',
        penerbit: 'Lybraria Press',
        tahun_terbit: 2026,
        stok_total: 5,
        lokasi_rak: 'RAK-Z9',
        deskripsi: 'Panduan Kotlin dan Jetpack Compose.',
      }),
    });
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createBody.data.stok_total, 5);
    assert.equal(createBody.data.stok_tersedia, 5);
    assert.equal(createBody.data.is_active, true);
    createdBookId = createBody.data.id_buku;

    // Duplicate kode_buku
    const dupKodeRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_kategori: defaultCategoryId,
        kode_buku: 'bk-test-999',
        judul: 'Duplikat Kode',
        penulis: 'A',
        penerbit: 'B',
        tahun_terbit: 2025,
        stok_total: 1,
      }),
    });
    assert.equal(dupKodeRes.status, 409);

    // Duplicate ISBN
    const dupIsbnRes = await fetch(`${baseUrl}/api/books`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id_kategori: defaultCategoryId,
        kode_buku: 'BK-TEST-998',
        isbn: '978-6020000999',
        judul: 'Duplikat ISBN',
        penulis: 'A',
        penerbit: 'B',
        tahun_terbit: 2025,
        stok_total: 1,
      }),
    });
    assert.equal(dupIsbnRes.status, 409);
  });

  it('FR-12 & FR-13: Update stok menghormati jumlah dipinjam & Delete ditolak saat masih dipinjam', async () => {
    // Simulasikan 2 eksemplar sedang DIPINJAM
    const loanInsert = await db.query(
      `
        INSERT INTO peminjaman (
          kode_peminjaman, id_anggota, id_buku, jumlah, tanggal_pengajuan,
          tanggal_pinjam, tanggal_jatuh_tempo, status_peminjaman
        )
        VALUES ('PJM-TEST-BOOK-001', $1, $2, 2, CURRENT_DATE, CURRENT_DATE, CURRENT_DATE + 7, 'DIPINJAM')
        RETURNING id_peminjaman
      `,
      [memberId, createdBookId]
    );
    tempLoanId = loanInsert.rows[0].id_peminjaman;

    // Update stok_total = 1 (< 2 dipinjam) harus ditolak 400
    const badStockRes = await fetch(`${baseUrl}/api/books/${createdBookId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ stok_total: 1 }),
    });
    assert.equal(badStockRes.status, 400);

    // Update stok_total = 6 (>= 2 dipinjam) -> stok_tersedia otomatis jadi 6 - 2 = 4
    const goodStockRes = await fetch(`${baseUrl}/api/books/${createdBookId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        judul: 'Arsitektur Android Modern Edisi 2',
        stok_total: 6,
      }),
    });
    const goodStockBody = await goodStockRes.json();
    assert.equal(goodStockRes.status, 200);
    assert.equal(goodStockBody.data.judul, 'Arsitektur Android Modern Edisi 2');
    assert.equal(goodStockBody.data.stok_total, 6);
    assert.equal(goodStockBody.data.stok_tersedia, 4);

    // FR-13: Delete buku saat masih ada peminjaman aktif harus ditolak 409
    const blockedDelRes = await fetch(`${baseUrl}/api/books/${createdBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(blockedDelRes.status, 409);

    // Selesaikan peminjaman sementara menjadi DIKEMBALIKAN, lalu coba soft-delete
    await db.query(
      "UPDATE peminjaman SET status_peminjaman = 'DIKEMBALIKAN', tanggal_kembali = CURRENT_DATE WHERE id_peminjaman = $1",
      [tempLoanId]
    );

    const softDelRes = await fetch(`${baseUrl}/api/books/${createdBookId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const softDelBody = await softDelRes.json();
    assert.equal(softDelRes.status, 200);
    assert.equal(softDelBody.data.is_active, false);

    // Buku soft-deleted tidak lagi tampil di katalog aktif Anggota (404)
    const memberDetailRes = await fetch(`${baseUrl}/api/books/${createdBookId}`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(memberDetailRes.status, 404);

    // Riwayat peminjaman tetap tersimpan di DB
    const historyCheck = await db.query(
      'SELECT id_peminjaman FROM peminjaman WHERE id_peminjaman = $1',
      [tempLoanId]
    );
    assert.equal(historyCheck.rows.length, 1);
  });
});
