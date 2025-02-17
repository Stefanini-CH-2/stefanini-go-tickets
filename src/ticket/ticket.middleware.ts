import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class TicketMiddleware implements NestMiddleware {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async use(req: any, res: any, next: () => void) {
    if (req.headers['authorization']) {
      const token = req.headers['authorization'];
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      await this.cacheManager.set('token', token);
      req.user = payload;
    }
    next();
  }
}
