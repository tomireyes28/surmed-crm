import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Filtro global que intercepta errores conocidos de Prisma y errores de validación
 * para devolver códigos HTTP estables (400 / 404 / 409) sin exponer detalles
 * internos de la base de datos ni trazas de infraestructura (T07 / F15).
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resBody = exception.getResponse();
      response.status(status).json(
        typeof resBody === 'string'
          ? { statusCode: status, message: resBody }
          : resBody,
      );
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      response.status(mapped.statusCode).json(mapped);
      return;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Los datos enviados no cumplen con el formato requerido.',
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Ocurrió un error interno al procesar la solicitud.',
    });
  }

  public mapPrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    error: string;
    message: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'Ya existe un registro con esos datos únicos.',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'El recurso solicitado no fue encontrado.',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message:
            'No se puede completar la operación porque el registro está vinculado a otros datos.',
        };
      case 'P2000':
      case 'P2007':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Uno o más campos contienen valores inválidos o exceden la longitud permitida.',
        };
      default:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'No se pudo procesar la operación solicitada sobre los datos.',
        };
    }
  }
}
