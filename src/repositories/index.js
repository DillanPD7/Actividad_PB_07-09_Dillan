function createCrudRepository(delegate) {
  return {
    list(options) {
      return delegate.findMany(options);
    },
    findById(id, options = {}) {
      return delegate.findUnique({ ...options, where: { id } });
    },
    create(data, options = {}) {
      return delegate.create({ ...options, data });
    },
    update(id, data, options = {}) {
      return delegate.update({ ...options, where: { id }, data });
    },
    delete(id) {
      return delegate.delete({ where: { id } });
    }
  };
}

function createRepositories(prisma) {
  return {
    usuarios: createCrudRepository(prisma.usuario),
    productos: {
      ...createCrudRepository(prisma.producto),
      decrementStock(id, cantidad) {
        return prisma.producto.updateMany({
          where: { id, stock: { gte: cantidad } },
          data: { stock: { decrement: cantidad } }
        });
      }
    },
    pedidos: createCrudRepository(prisma.pedido),
    detallesPedido: createCrudRepository(prisma.detallePedido)
  };
}

module.exports = { createCrudRepository, createRepositories };
