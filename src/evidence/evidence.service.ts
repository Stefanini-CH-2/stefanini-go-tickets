import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Evidence } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { DatabaseService, QueryParams } from 'stefaninigo';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class EvidenceService {
  private collectionName: string = 'evidences';
  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
  ) {}

  async create(evidences: Evidence | Evidence[]) {
    const createdAt = new Date().toISOString();
    if (Array.isArray(evidences)) {
      const evidenceWithIds = evidences.map((evidence) => ({
        id: uuidv4().toString(),
        createdAt,
        ...evidence,
      }));
      await this.databaseService.create(evidenceWithIds, this.collectionName);
      return evidenceWithIds.map((evidence) => evidence.id);
    } else {
      const id = uuidv4().toString();
      await this.databaseService.create(
        {
          id,
          createdAt,
          ...evidences,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const evidence = await this.databaseService.get(id, this.collectionName);
    if (!evidence) {
      throw new NotFoundException('Evience not found');
    }
    return evidence;
  }

  async delete(id: string) {
    const evidence = await this.databaseService.get(id, this.collectionName);
    if (!evidence) {
      throw new NotFoundException('Evidence not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'Evidence deleted successfully';
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

  async update(id: string, evidence: UpdateEvidenceDto) {
    const updatedAt = new Date().toISOString();
    evidence['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(id, evidence, this.collectionName)) &&
      'Update successful'
    );
  }
}
