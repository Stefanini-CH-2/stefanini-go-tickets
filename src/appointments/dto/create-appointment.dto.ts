import { Exclude, Type } from "class-transformer";
import { IsNotEmpty, IsString, ValidateNested } from "class-validator";

class Contact {
    @IsString()
    @IsNotEmpty()
    id: string;

    @IsString()
    @IsNotEmpty()
    names: string;

    @IsString()
    @IsNotEmpty()
    phone: string;

    @IsString()
    @IsNotEmpty()
    email: string;
}

export class Appointment {
    @IsString()
    @IsNotEmpty()
    ticketId: string;

    @IsString()
    @IsNotEmpty()
    technicianId: string;
  
    @IsString()
    @IsNotEmpty()
    startDate: string;

    @IsString()
    @IsNotEmpty()
    endDate: string;
  
    @ValidateNested()
    @Type(() => Contact)
    @IsNotEmpty()
    contact: Contact;

    @IsString()
    @IsNotEmpty()
    description: string;

    @IsString()
    @IsNotEmpty()
    comment: string;

    @Exclude()
    _id: string;
}

