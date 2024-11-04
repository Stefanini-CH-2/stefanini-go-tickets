import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Ticket } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { DatabaseService, QueryParams } from 'stefaninigo';
import { v4 as uuidv4 } from 'uuid';
import { StatesHistory } from 'src/states_history/dto/create-states-history.dto';
import { Utils } from 'src/utils/utils';
import { Evidence } from 'src/evidence/dto/create-evidence.dto';
import { Comment } from 'src/comment/dto/create-comment.dto';
import { EmployeeRole, Provider } from './enums';
import * as dayjs from 'dayjs';
import { StateMachineService } from './state_machine.service';

interface TransformedTicket {
  id: string;
  ticketNumber: string;
  createdAt: string;
  coordinatedAt?: string;
  region: string;
  comuna: string;
  technician: string;
  appointmentStatus?: string;
}

interface TicketsByStatus {
  [status: string]: TransformedTicket[];
}

@Injectable()
export class TicketService {
  private collectionName: string = 'tickets';
  private employeesCollection = 'employees';

  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
    private readonly stateMachine: StateMachineService
  ) { }

  async create(tickets: Ticket | Ticket[]) {
    const ticket = await this.databaseService.list(
      0,
      1,
      { filters: { ticket_number: tickets['ticket_number'] } },
      'tickets',
    );

    if (Array.isArray(ticket)) {
      if (ticket.length > 0) {
        throw new HttpException(
          `${tickets['ticket_number']} already exists`,
          400,
        );
      }
    }

    const createdAt = new Date().toISOString();
    if (Array.isArray(tickets)) {
      const ticketWithIds = tickets.map((ticket) => ({
        id: uuidv4().toString(),
        ...ticket,
        createdAt,
      }));
      await this.databaseService.create(ticketWithIds, this.collectionName);
      return ticketWithIds.map((ticket) => ticket.id);
    } else {
      const id = uuidv4().toString();
      await this.databaseService.create(
        {
          id,
          ...tickets,
          createdAt,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const ticket = await this.databaseService.get(id, this.collectionName);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  async delete(id: string) {
    const ticket = await this.databaseService.get(id, this.collectionName);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'Ticket deleted successfully';
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

  async updateState(ticketId: string, newState: string): Promise<any> {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    // Obtiene la máquina de estados usando el commerceId del ticket
    const stateMachine = await this.stateMachine.getStateMachine(ticket.commerceId);

    // Verifica si la transición de estado es válida
    if (!this.stateMachine.isTransitionAllowed(stateMachine, ticket.currentState, newState)) {
      throw new BadRequestException(`Transición inválida de ${ticket.currentState} a ${newState}`);
    }

    // Actualiza el estado del ticket
    const updatedAt = new Date().toISOString();
    await this.updateTicketField(ticketId, { currentState: newState, updatedAt });

    // Registra el cambio en el historial de estados
    await this.stateMachine.recordStateChange(ticket.commerceId, ticketId, ticket.currentState, newState, ticket.coordinators, ticket.technicals);

    return `Estado actualizado a ${newState} con éxito para el ticket ${ticket.ticket_number}`;
  }

  async listFlows(page: number, limit: number, queryParams: QueryParams) {
    page = Math.max(page, 1);
    const start = (page - 1) * limit;
    const total = await this.databaseService.count(
      queryParams,
      this.collectionName,
    );
    queryParams.sort = { ...queryParams.sort, plannedDate: 'desc' };
    const response = await this.databaseService.list(
      start,
      limit,
      queryParams,
      this.collectionName,
    );
    const tickets = Array.isArray(response) ? response : [];

    const {
      ticketsId,
      categoriesId,
      subcategoriesId,
      commercesId,
      branchesId,
      contactsId,
      coordinatorsId,
      technicalsId,
    } = this.mapFieldsIds(tickets);

    const records = await this.processFlows(tickets, {
      ticketsId,
      commercesId,
      branchesId,
      categoriesId,
      subcategoriesId,
      contactsId,
      coordinatorsId,
      technicalsId,
    });

    return {
      total,
      page,
      limit,
      records,
    };
  }

  mapFieldsIds(tickets) {
    return tickets?.reduce(
      (acc, ticket) => {
        acc.ticketsId?.push(ticket.id);
        acc.categoriesId?.push(ticket.categoryId);
        acc.subcategoriesId?.push(ticket.subcategoryId);
        acc.commercesId?.push(ticket.commerceId);
        acc.branchesId?.push(ticket.branchId);
        acc.contactsId?.push(...ticket.contactsId);
        acc.coordinatorsId?.push(
          ...ticket.coordinators.map((coordinator) => coordinator.id),
        );
        acc.technicalsId?.push(
          ...ticket.technicals.map((technical) => technical.id),
        );
        return acc;
      },
      {
        ticketsId: [],
        categoriesId: [],
        subcategoriesId: [],
        commercesId: [],
        branchesId: [],
        contactsId: [],
        coordinatorsId: [],
        technicalsId: [],
      },
    );
  }

  async update(id: string, ticket: UpdateTicketDto) {
    const updatedAt = new Date().toISOString();
    ticket['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(id, ticket, this.collectionName)) &&
      'Update successful'
    );
  }

  async flows(ticketId: string) {
    const ticket = await this.databaseService.get(
      ticketId,
      this.collectionName,
    );

    const {
      ticketsId,
      categoriesId,
      subcategoriesId,
      commercesId,
      branchesId,
      contactsId,
      coordinatorsId,
      technicalsId,
    } = this.mapFieldsIds([ticket]);

    const records = await this.processFlows([ticket], {
      ticketsId,
      commercesId,
      branchesId,
      categoriesId,
      subcategoriesId,
      contactsId,
      coordinatorsId,
      technicalsId,
    });

    return records[0];
  }

  async processFlows(
    tickets,
    {
      ticketsId,
      commercesId,
      branchesId,
      categoriesId,
      subcategoriesId,
      contactsId,
      coordinatorsId,
      technicalsId,
    },
  ) {
    const LIMIT = 100;

    const [
      commercesList,
      branchesList,
      categoriesList,
      subcategoriesList,
      contactsList,
      coordinatorsList,
      technicalsList,
      statesHistoryList,
      commentsList,
      evidencesList,
      devicesList,
      appointmentsList,
      attentionType,
      priority,
    ] = await Promise.all([
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: commercesId } },
        'commerces',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: branchesId } },
        'branches',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: categoriesId } },
        'categories',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: subcategoriesId } },
        'subcategories',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: contactsId } },
        'contacts',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: coordinatorsId } },
        'employees',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: technicalsId } },
        'employees',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { ticketId: ticketsId } },
        'states_history',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { ticketId: ticketsId } },
        'comments',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { ticketId: ticketsId } },
        'evidences',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { ticketId: ticketsId } },
        'devices',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { ticketId: ticketsId }, sort: { endDate: "desc" } },
        'appointments',
      ),
      this.databaseService.get('attentionType', 'datas'),
      this.databaseService.get('priority', 'datas'),
    ]);
    const records = [];
    for (const ticket of tickets) {
      const elements = this.getOwnTicketElements(
        ticket,
        commercesList,
        branchesList,
        contactsList,
        coordinatorsList,
        technicalsList,
        statesHistoryList,
        commentsList,
        evidencesList,
        devicesList,
        categoriesList,
        subcategoriesList,
        appointmentsList,
      );

      const ticketResult = this.mapSuperTicket(
        elements.ticket,
        elements.commerce,
        elements.branch,
        elements.contacts,
        elements.coordinators,
        elements.technicals,
        elements.statesHistory,
        elements.comments,
        elements.evidences,
        elements.devices,
        elements.category,
        elements.subcategory,
        elements.appointments,
        attentionType,
        priority,
      );

      records.push(ticketResult);
    }

    return records;
  }

  getOwnTicketElements(
    ticket,
    commercesList,
    branchesList,
    contactsList,
    coordinatorsList,
    technicalsList,
    statesHistoryList,
    commentsList,
    evidencesList,
    devicesList,
    categoriesList,
    subcategoriesList,
    appointmentsList,
  ) {
    const commerce = commercesList.find(
      (commerce) => commerce.id === ticket.commerceId,
    );
    const branch = branchesList.find((branch) => branch.id === ticket.branchId);
    const category = categoriesList.find(
      (category) => category.id === ticket.categoryId,
    );
    const subcategory = subcategoriesList.find(
      (subcategory) => subcategory.id === ticket.subcategoryId,
    );

    const contacts = contactsList.filter(
      (contact) => contact.commerceId === ticket.commerceId,
    );
    const coordinators = Array.isArray(ticket.coordinators)
      ? coordinatorsList.filter((coordinator) =>
        ticket.coordinators.map((c) => c.id)?.includes(coordinator.id),
      )
      : [];
    const technicals = Array.isArray(ticket.technicals)
      ? technicalsList.filter((technical) =>
        ticket.technicals.map((t) => t.id)?.includes(technical.id),
      )
      : [];

    const statesHistory = statesHistoryList
      .filter((history) => history.ticketId === ticket.id)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    const comments = commentsList.filter(
      (comment) => comment.ticketId === ticket.id,
    );
    const evidences = evidencesList.filter(
      (evidence) => evidence.ticketId === ticket.id,
    );
    const devices = devicesList.filter((device) =>
      evidences.some((evidence) => evidence.id === device.evidenceId),
    );
    const appointments = appointmentsList.filter(
      (appointment) => appointment.ticketId === ticket.id,
    );

    return {
      ticket,
      commerce,
      branch,
      contacts,
      coordinators,
      technicals,
      statesHistory,
      comments,
      evidences,
      devices,
      category,
      subcategory,
      appointments,
    };
  }

  mapSuperTicket(
    ticket,
    commerce,
    branch,
    contacts,
    coordinators,
    technicals,
    statesHistory,
    _comments,
    _evidences,
    _devices,
    category,
    subcategory,
    appointments,
    attentionType,
    priority,
  ) {
    const evidences = Utils.mapRecord(Evidence, _evidences);
    delete category?._id;
    delete subcategory?._id;

    const allEmployees = [...coordinators, ...technicals];

    const comments = Utils.mapRecord(Comment, _comments);

    const commentsWithEmployeeNames = comments.map((comment) => {
      const employee = allEmployees.find(
        (emp) => emp?.id === comment?.employeeId,
      );
      return {
        ...comment,
        employeeName: employee
          ? `${employee.firstName || ''} ${employee.secondName || ''} ${employee.firstSurname || ''} ${employee.secondSurname || ''}`
          : 'Nombre no encontrado',
      };
    });
    return {
      ticket: {
        id: ticket?.id,
        ticket_number: ticket?.ticket_number,
        description: ticket?.description,
        createAt: ticket?.createAt,
        updateAt: ticket?.updateAt,
        plannedDate: ticket?.plannedDate,
        sla: ticket?.sla,
        numSla: ticket?.numSla,
        dateSla: ticket?.dateSla,
        attentionType: attentionType?.values?.find(
          (_attentionType) => _attentionType.value === ticket?.attentionType,
        ),
        category,
        subcategory,
        createdAt: ticket.createdAt,
        priority: priority?.values?.find(
          (_priority) => _priority.value === ticket?.priority,
        ),
        currentState: ticket?.currentState,
      },
      commerce: {
        id: commerce?.id,
        rut: commerce?.rut,
        name: commerce?.name,
        observation: commerce?.observation,
        services: commerce?.services,
        logo: `${process.env['API_DOMAIN']}/v1/commerces/${commerce?.id}/logos/${commerce?.logoFileName}`,
      },
      branch: {
        id: branch?.id,
        rut: branch?.rut,
        location: {
          address: branch?.address,
          city: branch?.city,
          region: branch?.region,
          commune: branch?.commune,
          coords: {
            latitude: branch?.coords?.latitude,
            longitude: branch?.coords?.longitude,
          },
        },
        name: branch?.name,
        observation: branch?.observation,
        contacts: contacts?.map((contact) => ({
          id: contact?.id,
          names: `${contact?.firstName} ${contact?.lastName}`,
          phone: contact?.phone,
          email: contact?.mail,
          position: contact?.position,
        })),
      },
      coordinators: coordinators?.map((coordinator) => ({
        id: coordinator?.id,
        role: coordinator?.role,
        rut: coordinator?.rut,
        fullName: coordinator?.fullName,
        phone: coordinator?.phone,
        email: coordinator?.email,
      })),
      technicals: ticket.technicals?.map((technical) => {
        const technicalInfo = technicals.find(
          (tech) => tech?.id === technical?.id,
        );
        technicals;
        return {
          id: technical?.id,
          role: technicalInfo?.role,
          fullName:
            `${technicalInfo.firstName || ''} ${technicalInfo.secondName || ''} ${technicalInfo.firstSurname || ''} ${technicalInfo.secondSurname || ''}`
              .trim()
              .replace(/\s+/g, ' '),
          rut: technicalInfo.dniNumber || '',
          phone: technicalInfo?.phone,
          email: technicalInfo?.email,
          enabled: technical?.enabled,
          assignmentDate: technicalInfo?.assignmentDate,
        };
      }),
      history: Utils.mapRecord(StatesHistory, statesHistory),
      comments: commentsWithEmployeeNames,
      evidences,
      appointments,
    };
  }

  async getSummary(
    commercesId?: string[],
    regions?: string[],
    technicalsId?: string[],
    startDate?: Date,
    endDate?: Date,
    ticketNumber?: string,
  ) {
    const filters: any = {};

    // Solo agrega el filtro de comercio si commercesId tiene un valor
    if (commercesId && commercesId.length > 0) {
      filters.commerceId = commercesId;
    }

    // Solo agrega el filtro de comercio si commercesId tiene un valor
    if (technicalsId && technicalsId.length > 0) {
      filters['technicals.id'] = technicalsId;
    }

    let { records: tickets } = await this.listFlows(0, 1000000, {
      filters: filters,
      sort: { createdAt: 'desc' },
      search: { ticket_number: ticketNumber },
    });

    if (technicalsId?.length) {
      tickets = tickets
        .map((ticket) => ({
          ...ticket,
          technicals: ticket.technicals.filter(
            (tech) => tech.enabled && technicalsId.includes(tech.id),
          ),
        }))
        .filter((ticket) => ticket.technicals.length > 0);
    }

    if (regions && regions.length > 0) {
      tickets = tickets.filter((ticket) =>
        regions.includes(ticket.branch.location.region),
      );
    }

    if (startDate && endDate) {
      tickets = tickets.filter(
        (ticket) =>
          ticket.ticket.createdAt >= startDate &&
          ticket.ticket.createdAt <= endDate,
      );
    }

    if (!Array.isArray(tickets)) return {};

    const ticketsByStatus = this.transformTicketsByStatus(tickets);

    const uniqueCommercesMap = new Map();
    const uniqueTechnicalsMap = new Map();

    tickets.forEach((ticket) => {
      const commerce = ticket.commerce;
      uniqueCommercesMap.set(commerce.id, commerce.name);
    });

    tickets.forEach((ticket) => {
      const technicals = ticket.technicals;
      technicals.forEach((technical) => {
        uniqueTechnicalsMap.set(technical.id, technical.fullName);
      });
    });

    const clients = Array.from(uniqueCommercesMap, ([id, name]) => ({
      id,
      name,
    }));

    const technicals = Array.from(uniqueTechnicalsMap, ([id, name]) => ({
      id,
      name,
    }));

    const filtersSummary = {
      clients: clients,
      regions: [
        ...new Set(tickets.map((ticket) => ticket.branch.location.region)),
      ].map((region) => ({ name: region })),
      technicals: technicals,
    };

    const newTickets = tickets.map((ticket) => ticket.ticket);

    const ticketStatuses = newTickets.reduce(
      (acc: Record<string, number>, { currentState }) => {
        const _currentState = currentState.replace(' ', '');
        acc[_currentState] = (acc[_currentState] || 0) + 1;
        return acc;
      },
      {},
    );

    const totalTickets = tickets.length;

    const countByAttentionType = ticketStatuses['Cerrado'] || 0;

    const rateClosed = Math.round((countByAttentionType / totalTickets) * 100);
    const rateOpen = 100 - rateClosed;

    const closedVsPending = {
      closedPercentage: rateClosed,
      pendingPercentage: rateOpen,
    };

    const summary = {
      totalTickets,
      ticketsByStatus,
      ticketStatuses,
      closedVsPending,
      filters: filtersSummary,
    };

    return summary;
  }

  transformTicketsByStatus(tickets: any[]): TicketsByStatus {
    const ticketsByStatus: TicketsByStatus = {};

    tickets.forEach((ticket) => {
      const createdAt = new Date(ticket.ticket.createdAt).toISOString();

      const now = new Date().toISOString().split('T')[0];
      const transformedTicket: TransformedTicket = {
        id: ticket.ticket.id,
        ticketNumber: ticket.ticket.ticket_number,
        createdAt,
        region: ticket.branch.location.region,
        comuna: ticket.branch.location.commune,
        technician: ticket.technicals[0]?.fullName || 'N/A',
      };

      if (ticket.ticket.currentState === 'Coordinado') {
        transformedTicket.coordinatedAt = ticket.appointments[0]?.endDate;
        const coordinatedAt = new Date(transformedTicket.coordinatedAt).toISOString();
        const date1 = dayjs(coordinatedAt);
        const date2 = dayjs(now);
        if (date1.isAfter(date2)) {
          transformedTicket.appointmentStatus = 'upToDate';
        } else if (date1.isBefore(date2)) {
          transformedTicket.appointmentStatus = 'delayed';
        } else {
          transformedTicket.appointmentStatus = 'today';
        }
      }

      const currentState = ticket.ticket.currentState.replace(' ', '');
      if (!ticketsByStatus[currentState]) {
        ticketsByStatus[currentState] = [];
      }

      ticketsByStatus[currentState].push(transformedTicket);
    });
    return ticketsByStatus;
  }

  async assignTechnician(ticketId: string, technicianId: string, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const technician = await this.getEmployeeById(technicianId);
    if (!technician) throw new NotFoundException('Técnico no encontrado');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Despachador no encontrado');

    const currentlyAssignedTechnician = ticket.technicals.find(
      (tech) => tech.id === technicianId && tech.enabled
    );
    if (currentlyAssignedTechnician) {
      return `El técnico ${technician.firstName} ${technician.firstSurname} ya está asignado al ticket ${ticket.ticket_number}.`;
    }

    // Validación de permisos
    if (dispatcher.role !== EmployeeRole.ADMIN && dispatcher.provider !== technician.provider) {
      throw new ForbiddenException('Los despachadores solo pueden asignar técnicos de su propio proveedor');
    }

    // Validación de transición en la máquina de estados
    const stateMachine = await this.stateMachine.getStateMachine(ticket.commerceId);
    const targetState = 'technician_assigned';
    if (!this.stateMachine.isTransitionAllowed(stateMachine, ticket.currentState, targetState)) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState} a ${targetState} no está permitida`
      );
    }

    const updatedAt = new Date().toISOString();

    // Actualizar técnicos
    const updatedTechnicals = [
      ...ticket.technicals.map((tech) => {
        if (tech.enabled) {
          return {
            ...tech,
            enabled: false,
            unassignedBy: dispatcherId,
            unassignedAt: updatedAt,
          };
        }
        return tech;
      }),
      {
        id: technicianId,
        provider: technician.provider,
        role: technician.role,
        name: `${technician.firstName} ${technician.firstSurname}`,
        assignedBy: dispatcherId,
        assignedAt: updatedAt,
        enabled: true,
      },
    ];

    await this.updateTicketField(ticketId, {
      technicals: updatedTechnicals,
      currentState: targetState,
      updatedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      ticket.coordinators,
      updatedTechnicals
    );

    return `El técnico ${technician.firstName} ${technician.firstSurname} ha sido asignado exitosamente al ticket ${ticket.ticket_number} por el despachador ${dispatcher.firstName} ${dispatcher.firstSurname}.`;
  }

  async unassignTechnician(ticketId: string, technicianId: string | null, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Despachador no encontrado');

    let technicianToUnassign;

    if (!technicianId) {
      technicianToUnassign = ticket.technicals.find((tech) => tech.enabled);
      if (!technicianToUnassign) {
        return 'No hay técnicos asignados actualmente';
      }
      technicianId = technicianToUnassign.id;
    } else {
      technicianToUnassign = ticket.technicals.find((tech) => tech.id === technicianId);
      if (!technicianToUnassign) throw new NotFoundException('Técnico no encontrado en este ticket');
    }

    if (
      dispatcher.role !== EmployeeRole.ADMIN &&
      dispatcher.provider !== technicianToUnassign.provider
    ) {
      throw new ForbiddenException('No está autorizado para desasignar técnicos de otro proveedor');
    }

    if (!technicianToUnassign.enabled) {
      return 'El técnico ya estaba desasignado';
    }

    const stateMachine = await this.stateMachine.getStateMachine(ticket.commerceId);
    const targetState = 'technician_unassigned';
    if (!this.stateMachine.isTransitionAllowed(stateMachine, ticket.currentState, targetState)) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState} a ${targetState} no está permitida`
      );
    }

    const unassignedAt = new Date().toISOString();

    const updatedTechnicals = ticket.technicals.map((tech) => {
      if (tech.id === technicianId && tech.enabled) {
        return {
          ...tech,
          enabled: false,
          unassignedBy: dispatcherId,
          unassignedAt,
        };
      }
      return tech;
    });

    await this.updateTicketField(ticketId, {
      technicals: updatedTechnicals,
      currentState: targetState,
      updatedAt: unassignedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      ticket.coordinators,
      updatedTechnicals
    );

    return `El técnico ${technicianToUnassign.name} ha sido desasignado exitosamente del ticket ${ticket.ticket_number} por el despachador ${dispatcher.firstName} ${dispatcher.firstSurname}.`;
  }

  async assignDispatcher(ticketId: string, newDispatcherId: string, currentDispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const currentDispatcher = await this.getEmployeeById(currentDispatcherId);
    if (!currentDispatcher) throw new NotFoundException('Despachador actual no encontrado');

    const newDispatcher = await this.getEmployeeById(newDispatcherId);
    if (!newDispatcher) throw new NotFoundException('Nuevo despachador no encontrado');

    const currentlyAssignedDispatcher = ticket.coordinators.find(
      (dispatcher) => dispatcher.id === newDispatcherId && dispatcher.enabled
    );
    if (currentlyAssignedDispatcher) {
      return `El despachador ${currentlyAssignedDispatcher.name} ya está asignado al ticket ${ticket.ticket_number}.`;
    }

    if (
      currentDispatcher.role !== EmployeeRole.ADMIN &&
      newDispatcher.provider !== Provider.STEFANINI
    ) {
      throw new ForbiddenException(
        'Los despachadores de otros proveedores solo pueden asignar a despachadores de Stefanini'
      );
    }

    const stateMachine = await this.stateMachine.getStateMachine(ticket.commerceId);
    const targetState = 'dispatcher_assigned';
    if (!this.stateMachine.isTransitionAllowed(stateMachine, ticket.currentState, targetState)) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState} a ${targetState} no está permitida`
      );
    }

    const updatedAt = new Date().toISOString();

    const updatedDispatchers = [
      ...ticket.coordinators.map((dispatcher) => {
        if (dispatcher.enabled) {
          return {
            ...dispatcher,
            enabled: false,
            unassignedBy: currentDispatcherId,
            unassignedAt: updatedAt,
          };
        }
        return dispatcher;
      }),
      {
        id: newDispatcherId,
        provider: newDispatcher.provider,
        role: newDispatcher.role,
        name: `${newDispatcher.firstName} ${newDispatcher.firstSurname}`,
        assignedBy: currentDispatcherId,
        assignedAt: updatedAt,
        enabled: true,
      },
    ];

    const updatedTechnicals = ticket.technicals.map((tech) => {
      if (tech.enabled) {
        return {
          ...tech,
          enabled: false,
          unassignedBy: currentDispatcherId,
          unassignedAt: updatedAt,
        };
      }
      return tech;
    });

    await this.updateTicketField(ticketId, {
      coordinators: updatedDispatchers,
      technicals: updatedTechnicals,
      currentState: targetState,
      updatedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      updatedDispatchers,
      updatedTechnicals
    );

    return `El despachador ${newDispatcher.firstName} ${newDispatcher.firstSurname} ha sido asignado exitosamente al ticket ${ticket.ticket_number} por el despachador ${currentDispatcher.firstName} ${currentDispatcher.firstSurname}. Todos los técnicos asignados previamente han sido desasignados.`;
  }


  async unassignDispatcher(ticketId: string, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');

    if (dispatcher.role !== EmployeeRole.ADMIN) {
      throw new ForbiddenException('Only Stefanini admins can unassign dispatchers');
    }

    const unassignedAt = new Date().toISOString();

    const updatedDispatchers = ticket.coordinators.map(dispatcher => {
      if (dispatcher.id === dispatcherId && dispatcher.enabled) {
        return {
          ...dispatcher,
          enabled: false,
          unassignedBy: dispatcherId,
          unassignedAt
        };
      }
      return dispatcher;
    });

    const anyEnabled = ticket.coordinators.some(dispatcher => dispatcher.id === dispatcherId && dispatcher.enabled);
    if (!anyEnabled) {
      return 'There is not dispatchers enabled to unassign';
    }

    await this.updateTicketField(ticketId, { coordinators: updatedDispatchers });

    // Cambiar el estado del ticket y crear historial
    //await this.changeTicketState(ticketId, 'unnassign_dispatcher', dispatcherId, null, ticket.currentState);
    return `Dispatcher ${dispatcherId} successfully unassigned from ticket ${ticketId}.`;
  }

  private async getEmployeeById(employeeId: string) {
    return await this.databaseService.get(employeeId, this.employeesCollection);
  }

  private async updateTicketField(ticketId: string, fields: Partial<UpdateTicketDto>) {
    return await this.databaseService.update(ticketId, fields, this.collectionName);
  }

  private async getTicketById(ticketId: string) {
    return await this.databaseService.get(ticketId, this.collectionName);
  }
}
