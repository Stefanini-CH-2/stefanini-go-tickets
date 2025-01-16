import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StatesHistory } from './dto/create-states-history.dto';
import { UpdateStatesHistoryDto } from './dto/update-states-history.dto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService, QueryParams } from 'stefaninigo';

@Injectable()
export class StatesHistoryService {
  private collectionName: string = 'states_history';
  private statesCollection: string = 'datas';
  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
  ) {}

  async create(
    states: StatesHistory | StatesHistory[],
    commerceId: string,
  ): Promise<string[]> {
    const createdAt = new Date().toISOString();

    const stateMachines = await this.databaseService.list(
      0,
      1,
      { filters: { commerceId, id: 'state_machine' } },
      this.statesCollection,
    );
    if (Array.isArray(stateMachines) && !stateMachines.length) {
      throw new NotFoundException('Máquina de estados no encontrada');
    }
    const stateMachine = stateMachines[0];
    const mapState = (stateId: string) => {
      const foundState = stateMachine?.states?.find(
        (state: { id: string }) => state.id === stateId,
      );
      return foundState
        ? { name: foundState.label, value: foundState.id }
        : { name: stateId, value: stateId };
    };

    if (Array.isArray(states)) {
      const statesWithIds = states.map((stateHistory) => {
        const mappedState = mapState(stateHistory.stateId);
        return {
          id: uuidv4(),
          ...stateHistory,
          state: mappedState,
          createdAt,
        };
      });
      await this.databaseService.create(statesWithIds, this.collectionName);
      return statesWithIds.map((stateHistory) => stateHistory.id);
    } else {
      const id = uuidv4();
      const mappedState = mapState(states.stateId);
      await this.databaseService.create(
        {
          id,
          ...states,
          state: mappedState,
          createdAt,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const stateHistory = await this.databaseService.get(
      id,
      this.collectionName,
    );
    if (!stateHistory) {
      throw new NotFoundException('States not found');
    }
    return stateHistory;
  }

  async delete(id: string) {
    const stateHistory = await this.databaseService.get(
      id,
      this.collectionName,
    );
    if (!stateHistory) {
      throw new NotFoundException('State not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'State deleted successfully';
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

  async update(id: string, states: UpdateStatesHistoryDto) {
    const updatedAt = new Date().toISOString();
    states['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(id, states, this.collectionName)) &&
      'Update successful'
    );
  }
}
