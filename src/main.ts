import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './interceptor/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors();
  /* app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Ignora los campos no especificados en los DTOs
    forbidNonWhitelisted: true, // Lanza un error si hay campos no permitidos
    transform: true, // Transforma los tipos de datos
  })); */
  await app.listen(3000);
}
bootstrap();
