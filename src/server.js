require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { createApp } = require('./app');

const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3000);
const app = createApp(prisma);

async function start() {
  await prisma.$connect();
  const server = app.listen(port, () => {
    console.log(`API disponible en http://localhost:${port}/api/pedidos`);
    console.log(`Documentación Swagger en http://localhost:${port}/api-docs`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    });
  }
}

start().catch(async (error) => {
  console.error('No se pudo iniciar la API:', error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
