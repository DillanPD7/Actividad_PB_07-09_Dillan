const { AppError } = require('../errors');
const { createRepositories } = require('../repositories');

function parsePriceToCents(price) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(price));
  if (!match) {
    throw new Error(`El precio almacenado no tiene un formato válido: ${price}`);
  }
  return BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0');
}

function formatCents(cents) {
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

function createPedidosService(prisma) {
  return {
    async checkout({ usuarioId, productosComprados }) {
      return prisma.$transaction(async (transaction) => {
        const repositories = createRepositories(transaction);
        const usuario = await repositories.usuarios.findById(usuarioId);
        if (!usuario) {
          throw new AppError(400, 'El usuario indicado no existe.', 'USUARIO_INVALIDO');
        }

        const pedido = await repositories.pedidos.create({
          usuarioId,
          total: '0.00',
          estado: 'pendiente'
        });

        const cantidadesPorProducto = new Map();
        for (const productoSolicitado of productosComprados) {
          const cantidadTotal = (cantidadesPorProducto.get(productoSolicitado.productoId) || 0)
            + productoSolicitado.cantidad;
          if (!Number.isSafeInteger(cantidadTotal) || cantidadTotal > 2147483647) {
            throw new AppError(
              400,
              `La cantidad solicitada para el producto ${productoSolicitado.productoId} excede el límite permitido.`,
              'CANTIDAD_INVALIDA'
            );
          }
          cantidadesPorProducto.set(
            productoSolicitado.productoId,
            cantidadTotal
          );
        }

        let totalCents = 0n;
        for (const [productoId, cantidad] of cantidadesPorProducto) {
          const producto = await repositories.productos.findById(productoId);
          if (!producto) {
            throw new AppError(400, `El producto ${productoId} no existe.`, 'PRODUCTO_INVALIDO');
          }

          const actualizacion = await repositories.productos.decrementStock(productoId, cantidad);
          if (actualizacion.count !== 1) {
            throw new AppError(
              400,
              `Stock insuficiente para el producto ${productoId}.`,
              'STOCK_INSUFICIENTE'
            );
          }

          const precioCents = parsePriceToCents(producto.precio);
          const subtotalCents = precioCents * BigInt(cantidad);
          totalCents += subtotalCents;
          await repositories.detallesPedido.create({
            pedidoId: pedido.id,
            productoId,
            cantidad,
            precioUnitario: formatCents(precioCents),
            subtotal: formatCents(subtotalCents)
          });
        }

        if (totalCents > 999999999999n) {
          throw new AppError(422, 'El total del pedido excede el límite permitido.', 'TOTAL_INVALIDO');
        }

        return repositories.pedidos.update(
          pedido.id,
          { total: formatCents(totalCents), estado: 'completado' },
          { include: { usuario: true, detalles: { include: { producto: true } } } }
        );
      });
    }
  };
}

module.exports = { createPedidosService };
