require('dotenv').config();

const app = require('./app');
const db = require('./config/db');

const PORT = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    const dbInfo = await db.testConnection();
    console.log(`[DB] Connected to PostgreSQL (${process.env.DB_NAME}) at ${dbInfo.server_time}`);

    const server = app.listen(PORT, () => {
      console.log(`[SERVER] Lybraria API running on http://localhost:${PORT}`);
      console.log(`[DOCS] Swagger UI available at http://localhost:${PORT}/api/docs`);
    });

    const shutdown = async (signal) => {
      console.log(`\n[SERVER] Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        await db.pool.end();
        console.log('[DB] PostgreSQL pool closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('[SERVER] Failed to connect to PostgreSQL:', error.message);
    process.exit(1);
  }
};

startServer();
