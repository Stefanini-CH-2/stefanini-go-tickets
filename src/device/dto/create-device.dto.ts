import { Exclude } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class Device {
  @IsString()
  @IsNotEmpty()
  evidenceId: string;

  @IsString()
  @IsNotEmpty()
  ticketId: string;

  @IsString()
  @IsOptional()
  articleType: string;

  @IsString()
  @IsOptional()
  brand: string;

  @IsString()
  @IsOptional()
  category: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  inventoryNumber: string;

  @IsString()
  @IsOptional()
  ip: string;

  @IsString()
  @IsOptional()
  model: string;

  @IsString()
  @IsOptional()
  partNumber: string;

  @IsString()
  @IsOptional()
  serial: string;

  @IsString()
  @IsOptional()
  state: string;

  @IsString()
  @IsOptional()
  type: string;

  @IsOptional()
  commerceId: string[];

  @Exclude()
  _id: string;
}
