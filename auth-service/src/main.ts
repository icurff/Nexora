import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'internal/auth/introspect', method: RequestMethod.POST }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          fieldErrors: Object.fromEntries(
            errors.map((error) => [
              error.property,
              Object.values(error.constraints ?? {}),
            ]),
          ),
        }),
    }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001, '0.0.0.0');
}
await bootstrap();
