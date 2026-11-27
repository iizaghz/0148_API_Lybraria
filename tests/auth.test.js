require('dotenv').config();

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const app = require('../src/app');
const db = require('../src/config/db');
const { authenticate } = require('../src/middlewares/authMiddleware');
const { authorize } = require('../src/middlewares/roleMiddleware');
const { ROLES } = require('../src/constants/enums');
const { errorHandler } = require('../src/middlewares/errorHandler');

let server;
let baseUrl;
let rbacServer;
let rbacBaseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  // Mini test app to verify authorize(ROLES.ADMIN) middleware behavior (FR-07)
  const testRbacApp = express();
  testRbacApp.get('/admin-only', authenticate, authorize(ROLES.ADMIN), (req, res) => {
    res.status(200).json({ success: true, role: req.user.role });
  });
  testRbacApp.use(errorHandler);

  await new Promise((resolve) => {
    rbacServer = testRbacApp.listen(0, () => {
      rbacBaseUrl = `http://127.0.0.1:${rbacServer.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => rbacServer.close(resolve));
  await db.pool.end();
});

describe('Auth & Session Management (FR-01 s/d FR-08)', () => {
  let adminAccessToken;
  let adminRefreshToken;
  let memberAccessToken;

  it('FR-02: menolak login dengan input kosong (HTTP 400)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '', password: '' }),
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.success, false);
    assert.ok(Array.isArray(body.errors) && body.errors.length === 2);
  });

  it('FR-05: menolak kredensial salah dengan pesan aman (HTTP 401)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@lybraria.ac.id', password: 'SalahPassword' }),
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.success, false);
  });

  it('FR-03/FR-04/FR-27: login Admin dengan email mengembalikan token tanpa data sensitif', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: process.env.SEED_ADMIN_EMAIL || 'admin@lybraria.ac.id',
        password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.access_token);
    assert.ok(body.data.refresh_token);
    assert.equal(body.data.user.role, ROLES.ADMIN);
    assert.equal(body.data.user.password_hash, undefined);
    assert.equal(body.data.user.refresh_token_hash, undefined);

    adminAccessToken = body.data.access_token;
    adminRefreshToken = body.data.refresh_token;
  });

  it('FR-01/FR-03: login Anggota menggunakan NIM berhasil', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: process.env.SEED_MEMBER_NIM || '2300018148',
        password: process.env.SEED_MEMBER_PASSWORD || 'Anggota123!',
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.role, ROLES.ANGGOTA);
    assert.equal(body.data.user.nim, process.env.SEED_MEMBER_NIM || '2300018148');

    memberAccessToken = body.data.access_token;
  });

  it('GET /api/auth/me menolak tanpa token (401) dan menerima token valid (200)', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(unauthRes.status, 401);

    const authRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    const body = await authRes.json();

    assert.equal(authRes.status, 200);
    assert.equal(body.data.role, ROLES.ADMIN);
    assert.equal(body.data.password_hash, undefined);
  });

  it('FR-07: RBAC authorize(ADMIN) mengizinkan Admin (200) dan menolak Anggota (403)', async () => {
    const adminRes = await fetch(`${rbacBaseUrl}/admin-only`, {
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert.equal(adminRes.status, 200);

    const memberRes = await fetch(`${rbacBaseUrl}/admin-only`, {
      headers: { Authorization: `Bearer ${memberAccessToken}` },
    });
    assert.equal(memberRes.status, 403);
  });

  it('FR-06: refresh token menerbitkan token baru dan merevokasi token lama', async () => {
    const oldRefreshToken = adminRefreshToken;

    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: oldRefreshToken }),
    });
    const body = await refreshRes.json();

    assert.equal(refreshRes.status, 200);
    assert.ok(body.data.access_token);
    assert.ok(body.data.refresh_token);
    assert.notEqual(body.data.refresh_token, oldRefreshToken);

    adminAccessToken = body.data.access_token;
    adminRefreshToken = body.data.refresh_token;

    // Old rotated refresh token must fail
    const replayRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: oldRefreshToken }),
    });
    assert.equal(replayRes.status, 401);
  });

  it('FR-08: logout merevokasi refresh token sehingga tidak bisa dipakai lagi', async () => {
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAccessToken}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogoutRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: adminRefreshToken }),
    });
    assert.equal(afterLogoutRefresh.status, 401);
  });
});
