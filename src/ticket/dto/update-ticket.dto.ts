import { PartialType } from '@nestjs/mapped-types';
import { Ticket } from './create-ticket.dto';
import { IsString } from 'class-validator';

export class UpdateTicketDto extends PartialType(Ticket) {
    @IsString()
    currentState: string;

    @IsString()
    updatedAt: string;
}
