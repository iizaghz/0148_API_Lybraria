require('dotenv').config();

const app = require('./app');
const db = require('./config/db');

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    const dbInfo = await db.testConnection();
    console.log(`[DB] Connected to PostgreSQL (${process.env.DB_NAME}) at ${dbInfo.server_time}`);

    app.listen(PORT, () => {
      console.log(`[SERVER] Lybraria API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('[SERVER] Failed to connect to PostgreSQL:', error.message);
    process.exit(1);
  }
};

startServer();
