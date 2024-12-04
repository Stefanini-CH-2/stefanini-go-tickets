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
  type: string;

  @IsString()
  @IsOptional()
  brand: string;

  @IsString()
  @IsOptional()
  serial: string;

  @IsString()
  @IsOptional()
  ip: string;

  @IsString()
  @IsOptional()
  state: string;

  @IsString()
  @IsOptional()
  partNumber: string;

  @IsString()
  @IsOptional()
  inventoryNumber: string;

  @IsString()
  @IsOptional()
  model: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  category: string;

  @Exclude()
  _id: string;
}
