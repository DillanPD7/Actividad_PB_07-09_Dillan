const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { AppError } = require('./errors');
const { createPedidosRouter } = require('./routes/pedidos');

const openApiPath = path.join(__dirname, '..', 'openapi.yaml');
const openApiDocument = YAML.parse(fs.readFileSync(openApiPath, 'utf8'));

function createApp(prisma) {
  const app = express();

  app.use(express.json());
  app.get('/openapi.yaml', (req, res) => res.type('application/yaml').sendFile(openApiPath));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use('/api/pedidos', createPedidosRouter(prisma));

  app.use((req, res) => {
    res.status(404).json({ error: { message: 'Ruta no encontrada.', code: 'RUTA_NO_ENCONTRADA' } });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error instanceof AppError) {
      return res.status(error.status).json({
        error: { message: error.message, code: error.code }
      });
    }
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({
        error: { message: 'El cuerpo JSON no es válido.', code: 'JSON_INVALIDO' }
      });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: { message: 'Ya existe un recurso con esos datos.', code: 'CONFLICTO' }
      });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: { message: 'La referencia a otro recurso no es válida.', code: 'REFERENCIA_INVALIDA' }
      });
    }

    console.error(error);
    return res.status(500).json({
      error: { message: 'Error interno del servidor.', code: 'ERROR_INTERNO' }
    });
  });

  return app;
}

module.exports = { createApp };
