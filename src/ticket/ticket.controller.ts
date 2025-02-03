import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { Ticket } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { plainToClass } from 'class-transformer';
import {
  QueryExclude,
  QueryFilters,
  QueryParams,
  QuerySearch,
  QuerySort,
} from 'stefaninigo';
import { ParseJsonPipe } from 'src/pipes/json-pipe';
import { Utils } from 'src/utils/utils';
import { NewStateTicketDto } from './dto/newstate-ticket.dto';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  async create(@Body() tickets: Ticket) {
    return this.ticketService.create(tickets);
  }

  @Put(':id/states/:newState')
  async updateState(
    @Param('id') id: string,
    @Param('newState') newState: string,
    @Body() newStateBody?: NewStateTicketDto,
  ) {
    const result = await this.ticketService.updateState(
      id,
      newState,
      newStateBody,
    );
    return result;
  }

  @Get('/summaries')
  async summaries(
    @Query('commercesId', new ParseJsonPipe<string[]>(Array))
    commercesId: string[],
    @Query('techniciansId', new ParseJsonPipe<string[]>(Array))
    techniciansId: string[],
    @Query('regions', new ParseJsonPipe<string[]>(Array))
    regions: string[],
    @Query('startDate')
    startDate: Date,
    @Query('endDate')
    endDate: Date,
    @Query('ticketNumber')
    ticketNumber: string,
  ) {
    return await this.ticketService.getSummary(
      commercesId,
      regions,
      techniciansId,
      startDate,
      endDate,
      ticketNumber,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const result = this.ticketService.get(id);
    return plainToClass(Ticket, result);
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
    const queryParams: QueryParams = {
      filters,
      exclude,
      fields,
      sort,
      search,
    };
    const response = await this.ticketService.list(start, limit, queryParams);
    response.records = Utils.mapRecord(Ticket, response.records);
    return response;
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketService.update(id, updateTicketDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return await this.ticketService.delete(id);
  }

  @Get(':id/flows')
  async flows(@Param('id') id: string) {
    return await this.ticketService.flows(id);
  }

  @Get('/flows/all')
  async listFlows(
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
    const queryParams: QueryParams = {
      filters,
      exclude,
      fields,
      sort,
      search,
    };
    return await this.ticketService.listFlows(start, limit, queryParams);
  }

  @Get('technicians/:technicianId/stats')
  async getStatsByTechnician(
    @Param('technicianId') technicianId: string,
    @Query('dateRange') dateRange?: 'today' | 'week' | 'month',
    @Query('commerceId') commerceId?: string,
  ) {
    const result = await this.ticketService.getStatsByTechnician(
      technicianId,
      commerceId,
      dateRange,
    );
    return result;
  }

  @Post(':id/technicians')
  async assignTechnician(@Param('id') id: string, @Body() body: any) {
    const { technicianId, dispatcherId } = body;
    const result = await this.ticketService.assignTechnician(
      id,
      technicianId,
      dispatcherId,
    );
    return result;
  }

  @Delete(':id/technicians')
  async unassignTechnicians(@Param('id') id: string, @Body() body: any) {
    const { technicianId, dispatcherId } = body;
    const result = await this.ticketService.unassignTechnician(
      id,
      technicianId,
      dispatcherId,
    );
    return result;
  }

  @Post(':id/dispatchers')
  async assignDispatcher(@Param('id') id: string, @Body() body: any) {
    const { newDispatcherId, currentDispatcherId } = body;
    const result = await this.ticketService.assignDispatcher(
      id,
      newDispatcherId,
      currentDispatcherId,
    );
    return result;
  }

  @Delete(':id/dispatchers')
  async unassignDispatchers(@Param('id') id: string, @Body() body: any) {
    const { dispatcherId } = body;
    const result = await this.ticketService.unassignDispatcher(
      id,
      dispatcherId,
    );
    return result;
  }

  @Get('filters/:mode')
  async filtersMode(@Param('mode') mode: string){
    return await this.ticketService.filtersMode(mode);
  }
}
