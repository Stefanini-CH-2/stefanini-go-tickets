import { IsObject } from 'class-validator';

export class NewStateTicketDto {
  @IsObject()
  customs?: Record<string, any>;
}
