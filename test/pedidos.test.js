const assert = require('node:assert/strict');
const test = require('node:test');
const { createApp } = require('../src/app');
const { createPedidosService } = require('../src/services/pedidos');

function createFakePrisma({ stock = 10, precio = '12.50' } = {}) {
  const state = {
    usuarios: [{ id: 1, nombre: 'Ada', email: 'ada@example.com' }],
    productos: [{ id: 2, nombre: 'Libro', precio, stock }],
    pedidos: [],
    detalles: [],
    nextPedidoId: 1
  };

  const prisma = {
    async $transaction(callback) {
      const working = structuredClone(state);
      const transaction = {
        usuario: {
          findUnique: async ({ where }) => working.usuarios.find((item) => item.id === where.id) || null
        },
        producto: {
          findUnique: async ({ where }) => working.productos.find((item) => item.id === where.id) || null,
          updateMany: async ({ where, data }) => {
            const product = working.productos.find((item) => item.id === where.id);
            if (!product || product.stock < where.stock.gte) {
              return { count: 0 };
            }
            product.stock -= data.stock.decrement;
            return { count: 1 };
          }
        },
        pedido: {
          create: async ({ data }) => {
            const pedido = { id: working.nextPedidoId++, ...data };
            working.pedidos.push(pedido);
            return pedido;
          },
          update: async ({ where, data, include }) => {
            const pedido = working.pedidos.find((item) => item.id === where.id);
            Object.assign(pedido, data);
            if (!include) {
              return pedido;
            }
            return {
              ...pedido,
              usuario: working.usuarios.find((item) => item.id === pedido.usuarioId),
              detalles: working.detalles
                .filter((item) => item.pedidoId === pedido.id)
                .map((item) => ({
                  ...item,
                  producto: working.productos.find((product) => product.id === item.productoId)
                }))
            };
          }
        },
        detallePedido: {
          create: async ({ data }) => {
            const detalle = { id: working.detalles.length + 1, ...data };
            working.detalles.push(detalle);
            return detalle;
          }
        }
      };
      const result = await callback(transaction);
      Object.assign(state, working);
      return result;
    }
  };

  return { prisma, state };
}

test('checkout crea el pedido, calcula el total y descuenta el inventario', async () => {
  const { prisma, state } = createFakePrisma();
  const service = createPedidosService(prisma);

  const pedido = await service.checkout({
    usuarioId: 1,
    productosComprados: [{ productoId: 2, cantidad: 2 }]
  });

  assert.equal(pedido.estado, 'completado');
  assert.equal(pedido.total, '25.00');
  assert.equal(pedido.detalles[0].subtotal, '25.00');
  assert.equal(state.productos[0].stock, 8);
  assert.equal(state.pedidos.length, 1);
});

test('checkout combina líneas repetidas de producto antes de descontar el stock', async () => {
  const { prisma, state } = createFakePrisma();
  const service = createPedidosService(prisma);

  const pedido = await service.checkout({
    usuarioId: 1,
    productosComprados: [
      { productoId: 2, cantidad: 1 },
      { productoId: 2, cantidad: 2 }
    ]
  });

  assert.equal(state.productos[0].stock, 7);
  assert.equal(pedido.detalles.length, 1);
  assert.equal(pedido.detalles[0].cantidad, 3);
  assert.equal(pedido.total, '37.50');
});

test('stock insuficiente revierte pedido, detalles y descuentos', async () => {
  const { prisma, state } = createFakePrisma({ stock: 2 });
  const service = createPedidosService(prisma);

  await assert.rejects(
    service.checkout({
      usuarioId: 1,
      productosComprados: [{ productoId: 2, cantidad: 3 }]
    }),
    { code: 'STOCK_INSUFICIENTE', status: 400 }
  );

  assert.equal(state.productos[0].stock, 2);
  assert.equal(state.pedidos.length, 0);
  assert.equal(state.detalles.length, 0);
});

test('la API publica Swagger y acepta el checkout documentado', async (t) => {
  const { prisma, state } = createFakePrisma();
  const server = createApp(prisma).listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const docs = await fetch(`${baseUrl}/api-docs/`);
  assert.equal(docs.status, 200);
  assert.match(await docs.text(), /swagger-ui/);

  const invalid = await fetch(`${baseUrl}/api/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/api/pedidos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      usuarioId: 1,
      productosComprados: [{ productoId: 2, cantidad: 2 }]
    })
  });
  const pedido = await response.json();
  assert.equal(response.status, 201);
  assert.equal(pedido.total, '25.00');
  assert.equal(pedido.estado, 'completado');
  assert.equal(state.productos[0].stock, 8);
});
