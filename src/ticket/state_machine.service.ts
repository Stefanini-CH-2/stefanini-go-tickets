import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StatesHistory } from 'src/states_history/dto/create-states-history.dto';
import { StatesHistoryService } from 'src/states_history/states_history.service';
import { DatabaseService } from 'stefaninigo';

@Injectable()
export class StateMachineService {
  private statesCollection = 'datas';
  private cachedStateMachine: any = null;

  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
    private readonly stateHistory: StatesHistoryService
  ) {}

  async getStateMachine(commerceId: string) {
    if (this.cachedStateMachine && this.cachedStateMachine.commerceId === commerceId) {
      return this.cachedStateMachine;
    }

    const stateMachines = await this.databaseService.list(0, 1, { filters: { commerceId, id: "state_machine" } }, this.statesCollection);

    if (Array.isArray(stateMachines) && !stateMachines.length) {
      throw new NotFoundException('Máquina de estados no encontrada');
    }

    this.cachedStateMachine = stateMachines[0];
    return this.cachedStateMachine;
  }

  isTransitionAllowed(stateMachine: any, currentState: string, newState: string): boolean {
    const machine = stateMachine || this.cachedStateMachine;
    if (!machine) throw new Error('No se ha cargado ninguna máquina de estados');

    const state = machine.states.find((s) => s.id === currentState);
    return state ? state.transitions.includes(newState) : false;
  }

  async recordStateChange(commerceId: string, ticketId: string, fromState: string, toState: string, coordinators: any[], technicals: any[]) {
    const updatedAt = new Date().toISOString();
    const dispatcher = coordinators.find((c) => c.enabled);
    const technician = technicals.find((t) => t.enabled);

    const stateHistory: StatesHistory = {
      ticketId,
      stateId: toState,
      createdAt: updatedAt,
      description: `Cambio de estado de ${fromState} a ${toState}`,
      commerceId: commerceId,
      dispatcherId: dispatcher ? dispatcher.id : null,
      technicalId: technician ? technician.id : null,
    };

    await this.stateHistory.create(stateHistory, commerceId);
  }
}