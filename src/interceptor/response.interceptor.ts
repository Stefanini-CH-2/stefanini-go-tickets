import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        message: data,
      })),
      catchError((error) => {
        const status =
          error instanceof HttpException
            ? error.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const response = error.response;
        if (response && response.success !== undefined) {
          return throwError(() => error);
        }

        return throwError(() =>
          new HttpException({
            success: false,
            message:
              error.response?.message ||
              error.message ||
              'Unexpected error occurred',
            statusCode: status,
          }, status),
        );
      }),
    );
  }
}
