import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Put } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { Evidence } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { plainToClass } from 'class-transformer';
import { QueryExclude, QueryFilters, QueryParams, QuerySearch, QuerySort } from 'stefaninigo';
import { ParseJsonPipe } from 'src/pipes/json-pipe';
import { Utils } from 'src/utils/utils';

@Controller('evidences')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  async create(@Body() evidence: Evidence) {
    try {
      return this.evidenceService.create(evidence);
    } catch (error) {
      return error.message;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const result = this.evidenceService.get(id);
      return plainToClass(Evidence, result)
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
        const response = await this.evidenceService.list(
            start,
            limit,
            queryParams,
        );
        response.records = Utils.mapRecord(Evidence, response.records);
        return response;
    } catch (error) {
        return error.message;
    }
}


  @Put(':id')
  update(@Param('id') id: string, @Body() updateEvidenceDto: UpdateEvidenceDto) {
    try {
      return this.evidenceService.update(id, updateEvidenceDto);
    } catch (error) {
      return error.message;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return await this.evidenceService.delete(id);
    } catch (error) {
      return error.message;
    }
  }
}
