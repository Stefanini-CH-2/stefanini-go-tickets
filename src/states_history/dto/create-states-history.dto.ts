import { Exclude, Type } from 'class-transformer';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
    IsObject,
    isObject,
} from 'class-validator';

class Coords {
    @IsString()
    @IsNotEmpty()
    latitude: string;

    @IsString()
    @IsNotEmpty()
    longitude: string;
}

class Location {
    @ValidateNested()
    @Type(() => Coords)
    @IsObject()
    @IsOptional()
    coords: Coords;

    @IsString()
    @IsOptional()
    city: string;

    @IsString()
    @IsOptional()
    commune: string;

    @IsString()
    @IsOptional()
    region: string;

    @IsString()
    @IsOptional()
    address: string;
}

class State {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsNotEmpty()
    value: string;
}

export class StatesHistory {
    @IsString()
    @IsNotEmpty()
    ticketId: string;

    @IsString()
    @IsNotEmpty()
    dispatcherId: string;

    @IsString()
    @IsOptional()
    description: string;

    @IsString()
    @IsOptional()
    technicianId: string;

    @ValidateNested()
    @Type(() => Location)
    @IsObject()
    location?: Location;

    @IsString()
    @IsNotEmpty()
    stateId: string;

    @IsString()
    @IsNotEmpty()
    commerceId: string;

    @IsObject()
    customs?: Record<string, any>;

    @IsString()
    createdAt: string;

    @Exclude()
    _id?: string;
}
