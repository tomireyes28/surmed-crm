import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Activa las validaciones de los DTOs en toda la app
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  
  // Habilitamos CORS por si el frontend corre en otro puerto (ej: 3001)
  app.enableCors();

  // --- CONFIGURACIÓN DE SWAGGER ---
  const config = new DocumentBuilder()
    .setTitle('Surmed CRM API')
    .setDescription('Documentación oficial de los endpoints para el CRM de Surmed')
    .setVersion('1.0')
    .addBearerAuth() // Le avisa a Swagger que usamos Tokens JWT
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  // --------------------------------

  await app.listen(3000);
}
bootstrap();