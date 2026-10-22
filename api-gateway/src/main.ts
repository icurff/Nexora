import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createAuthProxy } from './auth-proxy.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(createAuthProxy());
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
