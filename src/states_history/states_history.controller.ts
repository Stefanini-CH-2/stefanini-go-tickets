import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Query, Put } from '@nestjs/common';
import { StatesHistoryService } from './states_history.service';
import { StatesHistory } from './dto/create-states-history.dto';
import { UpdateStatesHistoryDto } from './dto/update-states-history.dto';
import { plainToClass } from 'class-transformer';
import { ParseJsonPipe } from 'src/pipes/json-pipe';
import { QueryExclude, QueryFilters, QueryParams, QuerySearch, QuerySort } from 'stefaninigo';
import { Utils } from 'src/utils/utils';

@Controller('states/history')
export class StatesHistoryController {
  constructor(private readonly statesHistoryService: StatesHistoryService) {}

  @Post()
  async create(@Body() statesHistorys: StatesHistory) {
    try {
      return this.statesHistoryService.create(statesHistorys, statesHistorys.commerceId);
    } catch (error) {
      return error.message;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const result = this.statesHistoryService.get(id);
      return plainToClass(StatesHistory, result)
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
            search,
            exclude,
            fields,
            sort,
        };
        const response = await this.statesHistoryService.list(
            start,
            limit,
            queryParams,
        );
        response.records = Utils.mapRecord(StatesHistory, response.records);
        return response;
    } catch (error) {
        return error.message;
    }
}


  @Put(':id')
  update(@Param('id') id: string, @Body() updateStatesHistoryDto: UpdateStatesHistoryDto) {
    try {
      return this.statesHistoryService.update(id, updateStatesHistoryDto);
    } catch (error) {
      return error.message;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return await this.statesHistoryService.delete(id);
    } catch (error) {
      return error.message;
    }
  }
}
