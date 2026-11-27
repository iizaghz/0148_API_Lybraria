const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'lybraria_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL idle client error:', err);
});

const testConnection = async () => {
  const result = await pool.query('SELECT NOW() AS server_time');
  return result.rows[0];
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  testConnection,
};
