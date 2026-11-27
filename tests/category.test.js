require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');
const db = require('../src/config/db');

let server;
let baseUrl;
let adminToken;
let memberToken;
let createdCategoryId;

const loginAs = async (identifier, password) => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const body = await res.json();
  assert.equal(res.status, 200, `Gagal login untuk ${identifier}`);
  return body.data.access_token;
};

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  adminToken = await loginAs(
    process.env.SEED_ADMIN_EMAIL || 'admin@lybraria.ac.id',
    process.env.SEED_ADMIN_PASSWORD || 'Admin123!'
  );
  memberToken = await loginAs(
    process.env.SEED_MEMBER_NIM || '2300018148',
    process.env.SEED_MEMBER_PASSWORD || 'Anggota123!'
  );
});

after(async () => {
  if (createdCategoryId) {
    await db.query('DELETE FROM kategori WHERE id_kategori = $1', [createdCategoryId]);
  }
  await new Promise((resolve) => server.close(resolve));
  await db.pool.end();
});

describe('Category Management CRUDS (FR-16 s/d FR-21)', () => {
  it('Menolak akses tanpa token (HTTP 401)', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assert.equal(res.status, 401);
  });

  it('FR-17: Admin dan Anggota dapat membaca daftar kategori beserta jumlah_buku', async () => {
    const memberRes = await fetch(`${baseUrl}/api/categories`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const memberBody = await memberRes.json();

    assert.equal(memberRes.status, 200);
    assert.equal(memberBody.success, true);
    assert.ok(Array.isArray(memberBody.data) && memberBody.data.length >= 4);

    const ti = memberBody.data.find((c) => c.nama_kategori === 'Teknologi Informasi');
    assert.ok(ti, 'Kategori Teknologi Informasi harus ada');
    assert.equal(typeof ti.jumlah_buku, 'number');
    assert.ok(ti.jumlah_buku >= 2);
  });

  it('FR-20: Pencarian kategori berdasarkan nama atau deskripsi (?q=)', async () => {
    const resByName = await fetch(`${baseUrl}/api/categories?q=teknologi`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const bodyByName = await resByName.json();
    assert.equal(resByName.status, 200);
    assert.ok(bodyByName.data.some((c) => c.nama_kategori === 'Teknologi Informasi'));

    const resByDesc = await fetch(`${baseUrl}/api/categories?q=kalkulus`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    const bodyByDesc = await resByDesc.json();
    assert.equal(resByDesc.status, 200);
    assert.ok(bodyByDesc.data.some((c) => c.nama_kategori === 'Sains & Matematika'));
  });

  it('FR-21: Anggota ditolak (HTTP 403) saat mencoba Create, Update, atau Delete kategori', async () => {
    const postRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({ nama_kategori: 'Kategori Ilegal' }),
    });
    assert.equal(postRes.status, 403);

    const putRes = await fetch(`${baseUrl}/api/categories/1`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({ nama_kategori: 'Ubah Ilegal' }),
    });
    assert.equal(putRes.status, 403);

    const delRes = await fetch(`${baseUrl}/api/categories/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(delRes.status, 403);
  });

  it('FR-16: Admin dapat membuat kategori baru & menolak input kosong/duplikat', async () => {
    const emptyRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ nama_kategori: '   ' }),
    });
    assert.equal(emptyRes.status, 400);

    const createRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_kategori: 'Sejarah & Budaya Test',
        deskripsi: 'Koleksi sejarah nusantara dan kebudayaan dunia.',
      }),
    });
    const createBody = await createRes.json();
    assert.equal(createRes.status, 201);
    assert.equal(createBody.data.nama_kategori, 'Sejarah & Budaya Test');
    assert.equal(createBody.data.jumlah_buku, 0);
    createdCategoryId = createBody.data.id_kategori;

    // Duplicate check (case-insensitive)
    const dupRes = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ nama_kategori: 'sejarah & budaya test' }),
    });
    assert.equal(dupRes.status, 409);
  });

  it('FR-18: Admin dapat memperbarui kategori & mencegah duplikasi nama lain', async () => {
    const updateRes = await fetch(`${baseUrl}/api/categories/${createdCategoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_kategori: 'Sejarah & Antropologi Test',
        deskripsi: 'Deskripsi diperbarui.',
      }),
    });
    const updateBody = await updateRes.json();
    assert.equal(updateRes.status, 200);
    assert.equal(updateBody.data.nama_kategori, 'Sejarah & Antropologi Test');
    assert.equal(updateBody.data.deskripsi, 'Deskripsi diperbarui.');

    // Conflict with existing category name
    const dupUpdateRes = await fetch(`${baseUrl}/api/categories/${createdCategoryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nama_kategori: 'Teknologi Informasi',
      }),
    });
    assert.equal(dupUpdateRes.status, 409);
  });

  it('FR-19: Menolak hapus kategori yang masih dipakai buku (409) & menghapus kategori kosong (200)', async () => {
    // Find Teknologi Informasi category ID (used by seeded books)
    const listRes = await fetch(`${baseUrl}/api/categories?q=Teknologi Informasi`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listBody = await listRes.json();
    const usedCat = listBody.data.find((c) => c.nama_kategori === 'Teknologi Informasi');
    assert.ok(usedCat);

    const restrictedRes = await fetch(`${baseUrl}/api/categories/${usedCat.id_kategori}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(restrictedRes.status, 409);

    // Delete unused test category
    const delRes = await fetch(`${baseUrl}/api/categories/${createdCategoryId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(delRes.status, 200);
    createdCategoryId = null;
  });
});
