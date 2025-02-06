import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class TicketMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const jwt = req.headers['authorization'];
    if (jwt) {
      const token = jwt.split(' ')[1];
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      req.user = payload;
    }
    next();
  }
}
