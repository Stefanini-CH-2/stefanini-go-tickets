import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ParseIntPipe, Put } from '@nestjs/common';
import { DeviceService } from './device.service';
import { Device } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { plainToClass } from 'class-transformer';
import { ParseJsonPipe } from 'src/pipes/json.pipe';
import { QueryExclude, QueryFilters, QueryParams, QuerySearch, QuerySort } from 'stefaninigo';
import { Utils } from 'src/utils/utils';

@Controller('devices')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post()
  async create(@Body() device: Device) {
    try {
      return this.deviceService.create(device);
    } catch (error) {
      return error.message;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const result = this.deviceService.get(id);
      return plainToClass(Device, result)
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
        const response = await this.deviceService.list(
            start,
            limit,
            queryParams,
        );
        response.records = Utils.mapRecord(Device, response.records);
        return response;
    } catch (error) {
        return error.message;
    }
}


  @Put(':id')
  update(@Param('id') id: string, @Body() updateDeviceDto: UpdateDeviceDto) {
    try {
      return this.deviceService.update(id, updateDeviceDto);
    } catch (error) {
      return error.message;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return await this.deviceService.delete(id);
    } catch (error) {
      return error.message;
    }
  }
}
