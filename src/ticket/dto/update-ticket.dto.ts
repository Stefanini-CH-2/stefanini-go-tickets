import { PartialType } from '@nestjs/mapped-types';
import { Ticket } from './create-ticket.dto';
import { IsString } from 'class-validator';

export class UpdateTicketDto extends PartialType(Ticket) {
    @IsString()
    currentState: Record<string,string>;

    @IsString()
    updatedAt: string;
}
