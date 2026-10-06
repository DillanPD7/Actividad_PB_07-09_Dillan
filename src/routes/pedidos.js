const express = require('express');
const { createPedidosController } = require('../controllers/pedidos');
const { createPedidosService } = require('../services/pedidos');

function createPedidosRouter(prisma) {
  const router = express.Router();
  const controller = createPedidosController(createPedidosService(prisma));
  router.post('/', controller.checkout);
  return router;
}

module.exports = { createPedidosRouter };
