import {
    IsString,
} from 'class-validator';

export class NewStateTicketDto {
    @IsString()
    customs?: Record<string, any>;
}