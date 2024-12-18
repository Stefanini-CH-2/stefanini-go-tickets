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
  ) { }

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

  isTransitionAllowed(stateMachine: any, currentStateId: string, newStateId: string): boolean {
    if (!currentStateId && newStateId === "created") {
      return true;
    }
    const machine = stateMachine || this.cachedStateMachine;
    if (!machine) throw new Error('No se ha cargado ninguna máquina de estados');

    const state = machine.states?.find((s) => s.id === currentStateId);
    return state ? state.transitions?.includes(newStateId) : false;
  }

  async recordStateChange(
    commerceId: string,
    ticketId: string,
    fromState: Record<string, string>,
    toState: Record<string, string>,
    dispatchers: { id: string; enabled: boolean; fullName: string }[],
    technicians: { id: string; enabled: boolean; fullName: string }[],
    customs?: Record<string,any>
  ): Promise<void> {
    const updatedAt = new Date().toISOString();

    const getEnabledUser = (users: { enabled: boolean; fullName?: string; id?: string }[] = []) =>
      users.find(user => user.enabled) || null;

    const getLastTechnician = (techs: { enabled: boolean; fullName: string; id: string }[] = []) =>
      techs.length > 1 ? techs[techs.length - 2] : null;

    const generateDescription = (
      from: Record<string, string>,
      to: Record<string, string>,
      dispatcher: { fullName?: string } | null,
      technician: { fullName?: string } | null,
      lastTechnician: { fullName?: string } | null
    ): string => {
      if (to.id === "technician_assigned") {
        return `Cambio de estado ${from?.label}${lastTechnician ? ` atendido por el técnico ${lastTechnician.fullName}` : ''} al estado ${to?.label} al técnico ${technician?.fullName || ''} por el dispatcher ${dispatcher?.fullName || ''}.`;
      }
      if (to.id === "created") {
        return `El ticket fue creado por el dispatcher ${dispatcher?.fullName || ''}.`;
      }
      if (to.id !== "closed" && to.id !== "dispatcher_assigned") {
        return `Cambio de estado ${from?.label} al estado ${to?.label}${technician ? ` por el técnico ${technician.fullName}` : ''}.`;
      }
      return `Cambio de estado ${from?.label} al estado ${to?.label}.`;
    };

    const dispatcher = getEnabledUser(dispatchers);
    const technician = getEnabledUser(technicians);
    const lastTechnician = getLastTechnician(technicians);

    const description = generateDescription(fromState, toState, dispatcher, technician, lastTechnician);

    const stateHistory: StatesHistory = {
      ticketId,
      stateId: toState.id,
      createdAt: updatedAt,
      description,
      commerceId,
      dispatcherId: dispatcher?.id || null,
      technicianId: technician?.id || null,
      customs
    };

    await this.stateHistory.create(stateHistory, commerceId);
  }
}