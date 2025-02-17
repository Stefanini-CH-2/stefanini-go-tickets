import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsOptional,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Exclude, Type } from 'class-transformer';

enum Role {
  COMMERCE = 'COMMERCE',
  SUPERVISOR = 'SUPERVISOR',
}

class Approval {
  @IsOptional()
  userId: string;

  @IsOptional()
  contactId: string;

  @IsEnum(Role)
  @IsNotEmpty()
  role: Role;

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsOptional()
  fullName: string;
}

export class Evidence {
  @IsString()
  @IsNotEmpty()
  historyId: string;

  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  problem: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pictures: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Approval)
  @IsOptional()
  approvals: Approval[];

  @Exclude()
  _id: string;
}
