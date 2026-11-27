const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`,
  });
};

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Terjadi kesalahan pada server';
  const errors = err.errors || null;

  // Handle malformed JSON request body
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Format JSON pada body permintaan tidak valid';
  }

  // Handle common PostgreSQL errors
  if (err.code === '23505') {
    statusCode = 409;
    message = 'Data sudah terdaftar (duplikasi nilai unik)';
  } else if (err.code === '23503') {
    statusCode = 409;
    message = 'Operasi ditolak karena data masih berelasi dengan data lain';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Format parameter atau tipe data tidak valid';
  } else if (err.code === '23514') {
    statusCode = 400;
    message = 'Data melanggar aturan validasi basis data';
  }

  if (statusCode >= 500) {
    console.error('[ERROR]', err);
  }

  const payload = {
    success: false,
    message,
  };

  if (errors) {
    payload.errors = errors;
  }

  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
