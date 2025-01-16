import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Device } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { DatabaseService, QueryParams } from 'stefaninigo';
import { v4 as uuidv4 } from 'uuid';
@Injectable()
export class DeviceService {
  private collectionName: string = 'devices';
  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
  ) {}

  async create(devices: Device | Device[]) {
    const createdAt = new Date().toISOString();
    if (Array.isArray(devices)) {
      const deviceWithIds = devices.map((device) => ({
        id: uuidv4().toString(),
        ...device,
        createdAt,
      }));
      await this.databaseService.create(deviceWithIds, this.collectionName);
      return deviceWithIds.map((device) => device.id);
    } else {
      const id = uuidv4().toString();
      await this.databaseService.create(
        {
          id,
          ...devices,
          createdAt,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const device = await this.databaseService.get(id, this.collectionName);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  async delete(id: string) {
    const device = await this.databaseService.get(id, this.collectionName);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'Device deleted successfully';
  }

  async list(page: number, limit: number, queryParams: QueryParams) {
    page = page <= 0 ? 1 : page;
    const start = (page - 1) * limit;
    const total = await this.databaseService.count(
      queryParams,
      this.collectionName,
    );
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

  async update(id: string, device: UpdateDeviceDto) {
    const updatedAt = new Date().toISOString();
    device['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(id, device, this.collectionName)) &&
      'Update successful'
    );
  }
}
