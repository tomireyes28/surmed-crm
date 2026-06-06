import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Activa las validaciones de los DTOs en toda la app
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  
  // Habilitamos CORS por si el frontend corre en otro puerto (ej: 3001)
  app.enableCors();

  await app.listen(3000);
}
bootstrap();