const { AppError } = require('../errors');

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

function createPedidosController(service) {
  return {
    async checkout(req, res) {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new AppError(400, 'El cuerpo debe ser un objeto JSON.', 'CUERPO_INVALIDO');
      }
      if (!isPositiveInteger(body.usuarioId)) {
        throw new AppError(400, 'usuarioId debe ser un entero positivo.', 'USUARIO_INVALIDO');
      }
      if (!Array.isArray(body.productosComprados) || body.productosComprados.length === 0) {
        throw new AppError(
          400,
          'productosComprados debe contener al menos un producto.',
          'PRODUCTOS_INVALIDOS'
        );
      }

      for (const item of body.productosComprados) {
        if (!item || typeof item !== 'object' || Array.isArray(item)
          || !isPositiveInteger(item.productoId) || !isPositiveInteger(item.cantidad)) {
          throw new AppError(
            400,
            'Cada producto requiere productoId y cantidad como enteros positivos.',
            'PRODUCTO_INVALIDO'
          );
        }
      }

      const pedido = await service.checkout({
        usuarioId: body.usuarioId,
        productosComprados: body.productosComprados
      });
      res.status(201).json(pedido);
    }
  };
}

module.exports = { createPedidosController };
