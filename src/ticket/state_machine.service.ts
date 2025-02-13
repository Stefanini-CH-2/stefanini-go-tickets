import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StatesHistory } from 'src/states_history/dto/create-states-history.dto';
import { StatesHistoryService } from 'src/states_history/states_history.service';
import { DatabaseService } from 'stefaninigo';
import { lastValueFrom } from 'rxjs/internal/lastValueFrom';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class StateMachineService {
  private statesCollection = 'datas';
  private cachedStateMachine: any = null;

  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
    private readonly stateHistory: StatesHistoryService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getStateMachine(commerceId: string) {
    if (
      this.cachedStateMachine &&
      this.cachedStateMachine.commerceId === commerceId
    ) {
      return this.cachedStateMachine;
    }

    const stateMachines = await this.databaseService.list(
      0,
      1,
      { filters: { commerceId, id: 'state_machine' } },
      this.statesCollection,
    );

    if (Array.isArray(stateMachines) && !stateMachines.length) {
      throw new NotFoundException('Máquina de estados no encontrada');
    }

    this.cachedStateMachine = stateMachines[0];
    return this.cachedStateMachine;
  }

  isTransitionAllowed(
    stateMachine: any,
    currentStateId: string,
    newStateId: string,
  ): boolean {
    if (!currentStateId && newStateId === 'created') {
      return true;
    }
    const machine = stateMachine || this.cachedStateMachine;
    if (!machine)
      throw new Error('No se ha cargado ninguna máquina de estados');

    const state = machine.states?.find((s) => s.id === currentStateId);
    return state ? state.transitions?.includes(newStateId) : false;
  }

  async recordStateChange(
    commerceId: string,
    ticketId: string,
    fromState: Record<string, string>,
    toState: Record<string, string>,
    dispatchers: { id: string; enabled: boolean; fullName: string }[],
    dispatcher_: any,
    technicians: { id: string; enabled: boolean; fullName: string }[],
    customs?: Record<string, any>,
  ): Promise<void> {
    const updatedAt = new Date().toISOString();

    const getEnabledUser = (
      users: { enabled: boolean; fullName?: string; id?: string }[] = [],
    ) => users.find((user) => user.enabled) || null;

    const getLastTechnician = (
      techs: { enabled: boolean; fullName: string; id: string }[] = [],
    ) => (techs.length > 1 ? techs[techs.length - 2] : null);

    const generateDescription = (
      from: Record<string, string>,
      to: Record<string, string>,
      dispatcher: { fullName?: string } | null,
      technician: { fullName?: string } | null,
      lastTechnician: { fullName?: string } | null,
    ): string => {
      if (to.id === 'technician_assigned') {
        return `Cambio de estado ${from?.label}${lastTechnician ? ` atendido por el técnico ${lastTechnician.fullName}` : ''} al estado ${to?.label} al técnico ${technician?.fullName || ''} por el dispatcher ${dispatcher?.fullName || ''}.`;
      }
      if (to.id === 'created') {
        return `El ticket fue creado por el dispatcher ${dispatcher?.fullName || ''}.`;
      }
      if (to.id !== 'closed' && to.id !== 'dispatcher_assigned') {
        return `Cambio de estado ${from?.label} al estado ${to?.label}${technician ? ` por el técnico ${technician.fullName}` : ''}.`;
      }
      return `Cambio de estado ${from?.label} al estado ${to?.label}.`;
    };

    const dispatcher = dispatcher_ ? dispatcher_ : getEnabledUser(dispatchers);

    const technician = getEnabledUser(technicians);
    const lastTechnician = getLastTechnician(technicians);

    const description = generateDescription(
      fromState,
      toState,
      dispatcher,
      technician,
      lastTechnician,
    );

    const stateHistory: StatesHistory = {
      ticketId,
      stateId: toState.id,
      createdAt: updatedAt,
      description,
      commerceId,
      dispatcherId: dispatcher?.id || null,
      technicianId: technician?.id || null,
      customs,
    };

    if (toState.id === 'reschedule') {
      const baseUrl = `${this.configService.get<string>('ods.endpoint')}`;
      const url = `${baseUrl}/orders/${ticketId}/commerce/${commerceId}/url`;
      const getOdsUrl = await this.httpService.axiosRef.get(url);
      stateHistory.customs.ods = {
        fileName: getOdsUrl.data?.fileName,
        fielPath: getOdsUrl.data?.filePath,
        url: getOdsUrl.data?.url
      };
    }

    await this.stateHistory.create(stateHistory, commerceId);

    const observerPayload = {
      ticketId,
      newState: toState.id,
      clientId: customs.clientId || '',
    };

    try {
      const observerUrl = `${this.configService.get<string>('observer.endpoint')}/state-changes`;
      await lastValueFrom(this.httpService.post(observerUrl, observerPayload));
    } catch (error) {
      console.error(`Error al notificar al módulo observer: ${error.message}`);
      console.error(error);
    }
  }
}
