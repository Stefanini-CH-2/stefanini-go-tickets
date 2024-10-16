import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe, Query, Put } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { Appointment } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { plainToClass } from 'class-transformer';
import { ParseJsonPipe } from 'src/pipes/json.pipe';
import { QueryExclude, QueryFilters, QueryParams, QuerySearch, QuerySort } from 'stefaninigo';
import { Utils } from 'src/utils/utils';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  async create(@Body() appointment: Appointment) {
    try {
      return this.appointmentsService.create(appointment);
    } catch (error) {
      return error.message;
    }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    try {
      const result = this.appointmentsService.get(id);
      return plainToClass(Appointment, result)
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
        const response = await this.appointmentsService.list(
            start,
            limit,
            queryParams,
        );
        response.records = Utils.mapRecord(Appointment, response.records);
        return response;
    } catch (error) {
        return error.message;
    }
}


  @Put(':id')
  update(@Param('id') id: string, @Body() updateAppointmentDto: UpdateAppointmentDto) {
    try {
      return this.appointmentsService.update(id, updateAppointmentDto);
    } catch (error) {
      return error.message;
    }
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    try {
      return await this.appointmentsService.delete(id);
    } catch (error) {
      return error.message;
    }
  }
}
