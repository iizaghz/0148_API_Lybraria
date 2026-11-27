require('dotenv').config();

const db = require('../../src/config/db');
const { hashPassword } = require('../../src/utils/password');
const { ROLES, ACCOUNT_STATUS } = require('../../src/constants/enums');

const seedInitialUsers = async () => {
  try {
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lybraria.ac.id';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123!';
    const adminHash = await hashPassword(adminPassword);

    const adminResult = await db.query(
      `
        INSERT INTO anggota (
          nim, nama_lengkap, email, password_hash, program_studi, no_telepon, role, status_akun
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (email) DO NOTHING
        RETURNING id_anggota, email, role, status_akun
      `,
      [
        null,
        'Admin Perpustakaan Lybraria',
        adminEmail,
        adminHash,
        null,
        '081200000001',
        ROLES.ADMIN,
        ACCOUNT_STATUS.AKTIF,
      ]
    );

    if (adminResult.rows.length > 0) {
      console.log('[SEED] Akun Admin awal berhasil dibuat:', adminResult.rows[0]);
    } else {
      console.log(`[SEED] Akun Admin (${adminEmail}) sudah ada, dilewati.`);
    }

    const memberEmail = process.env.SEED_MEMBER_EMAIL || 'mahasiswa@lybraria.ac.id';
    const memberNim = process.env.SEED_MEMBER_NIM || '2300018148';
    const memberPassword = process.env.SEED_MEMBER_PASSWORD || 'Anggota123!';
    const memberHash = await hashPassword(memberPassword);

    const memberResult = await db.query(
      `
        INSERT INTO anggota (
          nim, nama_lengkap, email, password_hash, program_studi, no_telepon, role, status_akun
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (email) DO NOTHING
        RETURNING id_anggota, nim, email, role, status_akun
      `,
      [
        memberNim,
        'Mahasiswa Contoh Lybraria',
        memberEmail,
        memberHash,
        'Informatika',
        '081200000002',
        ROLES.ANGGOTA,
        ACCOUNT_STATUS.AKTIF,
      ]
    );

    if (memberResult.rows.length > 0) {
      console.log('[SEED] Akun Anggota contoh berhasil dibuat:', memberResult.rows[0]);
    } else {
      console.log(`[SEED] Akun Anggota (${memberEmail}) sudah ada, dilewati.`);
    }
  } catch (error) {
    console.error('[SEED] Gagal melakukan seeding akun awal:', error.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
};

seedInitialUsers();
