const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const openApiSpec = require('../docs/openapi.json');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  if (Array.isArray(req.body)) {
    return res.status(400).json({
      success: false,
      message: 'Body permintaan harus berupa objek JSON',
    });
  }
  return next();
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Lybraria REST API',
    docs: '/api/docs',
  });
});

app.get('/api/docs.json', (req, res) => {
  res.status(200).json(openApiSpec);
});

app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Lybraria REST API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  })
);

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
