import { Exclude, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class DisptacherOrTechnician {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsBoolean()
  @IsNotEmpty()
  enabled: boolean;
}

export class Ticket {
  @IsString()
  @IsNotEmpty()
  ticket_number: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  plannedDate: string;

  @IsString()
  @IsOptional()
  sla: string;

  @IsDate()
  @IsOptional()
  dateSla: Date;

  @IsString()
  @IsOptional()
  numSla: string;

  @IsNotEmpty()
  attentionType: string;

  @IsString()
  @IsOptional()
  categoryId: string;

  @IsString()
  @IsOptional()
  subcategoryId: string;

  @IsString()
  @IsNotEmpty()
  priority: string;

  @IsString()
  @IsNotEmpty()
  commerceId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  contactsId: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisptacherOrTechnician)
  @IsNotEmpty()
  dispatchers: DisptacherOrTechnician[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DisptacherOrTechnician)
  @IsOptional()
  technicians: DisptacherOrTechnician[];

  @Exclude()
  _id: string;
}
