import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Query, Put } from '@nestjs/common';
import { CommentService } from './comment.service';
import { Comment } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { plainToClass } from 'class-transformer';
import { ParseJsonPipe } from 'src/pipes/json.pipe';
import { QueryExclude, QueryFilters, QueryParams, QuerySearch, QuerySort } from 'stefaninigo';
import { Utils } from 'src/utils/utils';

@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  async create(@Body() comment: Comment) {
    try {
      return this.commentService.create(comment);
    } catch (error) {
      return error.message;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const result = this.commentService.get(id);
      return plainToClass(Comment, result)
    } catch (error) {
      
    }
  }

  @Get()
  async list(
    @Query('page', ParseIntPipe) start: number,
    @Query('limit', ParseIntPipe) limit: number,
    @Query('filters', new ParseJsonPipe<QueryFilters>(QueryFilters))
    filters: QueryFilters,
    @Query('exclude', new ParseJsonPipe<QueryExclude>(QueryExclude))
    exclude: QueryExclude,
    @Query('fields', new ParseJsonPipe<string[]>(Array)) fields: string[],
    @Query('sort', new ParseJsonPipe<QuerySort>(QuerySort)) sort: QuerySort,
    @Query('search', new ParseJsonPipe<QuerySearch>(QuerySearch))
    search: QuerySearch,
) {
    try {
        const queryParams: QueryParams = {
            filters,
            exclude,
            fields,
            sort,
            search
        };
        const response = await this.commentService.list(
            start,
            limit,
            queryParams,
        );
        response.records = Utils.mapRecord(Comment, response.records);
        return response;
    } catch (error) {
        return error.message;
    }
}


  @Put(':id')
  update(@Param('id') id: string, @Body() updateCommentDto: UpdateCommentDto) {
    try {
      return this.commentService.update(id, updateCommentDto);
    } catch (error) {
      return error.message;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return await this.commentService.delete(id);
    } catch (error) {
      return error.message;
    }
  }
}
