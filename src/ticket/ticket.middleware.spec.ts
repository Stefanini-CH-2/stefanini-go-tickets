import { TicketMiddleware } from './ticket.middleware';

describe('TicketMiddleware', () => {
  it('should be defined', () => {
    expect(new TicketMiddleware()).toBeDefined();
  });
});
