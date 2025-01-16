import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Appointment } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { DatabaseService, QueryParams } from 'stefaninigo';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AppointmentsService {
  private collectionName: string = 'appointments';
  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
  ) {}

  async create(appointments: Appointment | Appointment[]) {
    const createdAt = new Date().toISOString();
    if (Array.isArray(appointments)) {
      const appointmentWithIds = appointments.map((appointment) => ({
        id: uuidv4(),
        ...appointment,
        createdAt,
      }));
      await this.databaseService.create(
        appointmentWithIds,
        this.collectionName,
      );
      return appointmentWithIds.map((appointment) => appointment.id);
    } else {
      const id = uuidv4();
      await this.databaseService.create(
        {
          id,
          ...appointments,
          createdAt,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const appointment = await this.databaseService.get(id, this.collectionName);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  async delete(id: string) {
    const appointment = await this.databaseService.get(id, this.collectionName);
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'Appointment deleted successfully';
  }

  async list(page: number, limit: number, queryParams: QueryParams) {
    page = page <= 0 ? 1 : page;
    const start = (page - 1) * limit;
    const total = await this.databaseService.count(
      queryParams,
      this.collectionName,
    );
    queryParams.sort = { ...queryParams.sort, createdAt: 'desc' };
    const records = await this.databaseService.list(
      start,
      limit,
      queryParams,
      this.collectionName,
    );

    return {
      total,
      page,
      limit,
      records,
    };
  }

  async update(id: string, appointment: UpdateAppointmentDto) {
    const updatedAt = new Date().toISOString();
    appointment['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(
        id,
        appointment,
        this.collectionName,
      )) && 'Update successful'
    );
  }
}
