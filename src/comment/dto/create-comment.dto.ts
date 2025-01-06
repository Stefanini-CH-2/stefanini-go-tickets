import { Exclude } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateCommentDto {
    @IsString()
    @IsNotEmpty()
    historyId: string;

    @IsString()
    @IsNotEmpty()
    ticketId: string;
  
    @IsString()
    @IsNotEmpty()
    employeeId: string;

    @IsOptional()
    flag?: boolean;

    /* @IsString()
    @IsOptional()
    employeeName: string;

    @IsString()
    @IsOptional()
    employeeRole: string; */

    @IsString()
    @IsNotEmpty()
    statusId: string;
  
    @IsString()
    @IsNotEmpty()
    comment: string;

    @Exclude()
    _id: string;
}
