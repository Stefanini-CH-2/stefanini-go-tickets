import { PartialType } from '@nestjs/mapped-types';
import { Comment } from './create-comment.dto';
import { IsOptional } from 'class-validator';

export class UpdateCommentDto extends PartialType(Comment) {
    @IsOptional()
    flag?: boolean;
}
