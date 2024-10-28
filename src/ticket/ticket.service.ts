import {
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

  // Asignar técnico con historial de asignación
  async assignTechnician(ticketId: string, technicianId: string, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const technician = await this.getEmployeeById(technicianId);
    if (!technician) throw new NotFoundException('Technician not found');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');

    const currentlyAssignedTechnician = ticket.technicals.find(tech => tech.id === technicianId && tech.enabled);
    if (currentlyAssignedTechnician) {
      return `Technician ${technicianId} is already assigned to ticket ${ticketId}.`;
    }
    // Validación: Solo admin de Stefanini puede asignar técnicos de cualquier proveedor
    if (dispatcher.role !== EmployeeRole.ADMIN && dispatcher.provider !== technician.provider) {
      throw new ForbiddenException('Dispatchers can only assign technicians from their own provider');
    }

    const updatedAt = new Date().toISOString();
    const updatedTechnicals = [
      ...ticket.technicals.map(tech => {
        if (tech.enabled) {
          return {
            ...tech,
            enabled: false,
            unassignedBy: dispatcherId,
            unassignedAt: updatedAt
          };
        }
        return tech;
      }),
      {
        id: technicianId,
        provider: technician.provider,
        role: technician.role,
        assignedBy: dispatcherId,
        assignedAt: updatedAt,
        enabled: true,
      }
    ];

    await this.updateTicketField(ticketId, { technicals: updatedTechnicals });

    // Cambiar el estado del ticket y crear historial
    await this.changeTicketState(ticketId, 'assign_technician', dispatcherId, technicianId, ticket.currentState);
    return `Technician ${technicianId} successfully assigned to ticket ${ticketId} by dispatcher ${dispatcherId}.`;
  }

  async unassignTechnician(ticketId: string, technicianId: string | null, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');

    let technicianToUnassign;

    // Si no se proporciona technicianId, buscar el único técnico habilitado
    if (!technicianId) {
      technicianToUnassign = ticket.technicals.find(tech => tech.enabled);
      if (!technicianToUnassign) {
        return 'No technicians are currently assigned';
      }
      technicianId = technicianToUnassign.id;
    } else {
      // Buscar el técnico por ID proporcionado
      technicianToUnassign = ticket.technicals.find(tech => tech.id === technicianId);
      if (!technicianToUnassign) throw new NotFoundException('Technician not found in this ticket');
    }

    // Validación: Solo un dispatcher del mismo proveedor o un admin de Stefanini puede desasignar técnicos
    if (dispatcher.role !== EmployeeRole.ADMIN && dispatcher.provider !== technicianToUnassign.provider) {
      throw new ForbiddenException('You are not authorized to unassign technicians from another provider');
    }

    if (!technicianToUnassign.enabled) {
      return 'Technician was already unassigned';
    }

    const unassignedAt = new Date().toISOString();

    const updatedTechnicals = ticket.technicals.map(tech => {
      if (tech.id === technicianId && tech.enabled) {
        return {
          ...tech,
          enabled: false,
          unassignedBy: dispatcherId,
          unassignedAt
        };
      }
      return tech;
    });

    await this.updateTicketField(ticketId, { technicals: updatedTechnicals });

    // Cambiar el estado del ticket y crear historial
    await this.changeTicketState(ticketId, 'unnassign_technician', dispatcherId, technicianId, ticket.currentState);
    return `Technician ${technicianId} successfully unassigned from ticket ${ticketId} by dispatcher ${dispatcherId}.`;
  }

  async assignDispatcher(ticketId: string, newDispatcherId: string, currentDispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const currentDispatcher = await this.getEmployeeById(currentDispatcherId);
    if (!currentDispatcher) throw new NotFoundException('Current dispatcher not found');

    const newDispatcher = await this.getEmployeeById(newDispatcherId);
    if (!newDispatcher) throw new NotFoundException('New dispatcher not found');

    const currentlyAssignedDispatcher = ticket.coordinators.find(dispatcher => dispatcher.id === newDispatcherId && dispatcher.enabled);
    if (currentlyAssignedDispatcher) {
      return `Dispatcher ${newDispatcherId} is already assigned to ticket ${ticketId}.`;
    }

    if (currentDispatcher.role !== EmployeeRole.ADMIN && newDispatcher.provider !== Provider.STEFANINI) {
      throw new ForbiddenException('Dispatchers from other providers can only assign to Stefanini dispatchers');
    }

    if (currentDispatcher.role === EmployeeRole.ADMIN) {
      if (newDispatcher.role === EmployeeRole.DISPATCHER || currentDispatcher.role === EmployeeRole.ADMIN) {
        await this.changeTicketState(ticketId, 'assign_dispatcher', currentDispatcherId, null, ticket.currentState);
        await this.unassignTechnician(ticketId, null, currentDispatcherId);
      }
    }

    if (currentDispatcher.role === EmployeeRole.DISPATCHER && newDispatcher.role === EmployeeRole.ADMIN && newDispatcher.provider === Provider.STEFANINI) {
      await this.changeTicketState(ticketId, 'returned', currentDispatcherId, null, ticket.currentState);
      await this.unassignTechnician(ticketId, null, currentDispatcherId);
    }

    const updatedAt = new Date().toISOString();

    const updatedDispatchers = [
      ...ticket.coordinators.map(dispatcher => {
        if (dispatcher.enabled) {
          return {
            ...dispatcher,
            enabled: false,
            unassignedBy: currentDispatcherId,
            unassignedAt: updatedAt
          };
        }
        return dispatcher;
      }),
      {
        id: newDispatcherId,
        provider: newDispatcher.provider,
        role: newDispatcher.role,
        assignedBy: currentDispatcherId,
        assignedAt: updatedAt,
        enabled: true
      }
    ];

    await this.updateTicketField(ticketId, { coordinators: updatedDispatchers });
    return `Dispatcher ${newDispatcherId} successfully assigned to ticket ${ticketId} by dispatcher ${currentDispatcherId}.`;
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
    await this.changeTicketState(ticketId, 'unnassign_dispatcher', dispatcherId, null, ticket.currentState);
    return `Dispatcher ${dispatcherId} successfully unassigned from ticket ${ticketId}.`;
  }

  // Actualizar el cambio de estado y crear historial
  private async changeTicketState(ticketId: string, action: string, dispatcherId: string, technicalId: string, currentState: string) {
    const updatedAt = new Date().toISOString();
    const newStateId = this.getStateId(action);
    if (!this.isValidAction(currentState, action)) {
      throw new ForbiddenException('Action is not allowed in the current state');
    };
    await this.updateTicketField(ticketId, { currentState: newStateId, updatedAt });

    const stateHistory: StatesHistory = {
      ticketId,
      stateId: newStateId,
      createdAt: updatedAt,
      description: `State changed from ${currentState} to ${newStateId}`,
      dispatcherId: dispatcherId || null,
      technicalId: technicalId || null
    };

    await this.databaseService.create(stateHistory, 'states_history');
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

  private getStateId(action: string): string {
    const stateActionMapping = {
      'assign_technician': 'TecnicoAsignado',
      'unnassign_technician': 'SinTecnico',
      'assign_dispatcher': 'DispatcherAsignado',
      'unnassign_dispatcher': 'SinDispatcher',
      'returned': 'Retornado',
    };
    return stateActionMapping[action];
  }

  private isValidAction(currentState: string, action: string): boolean {
    const invalidStatesForActions = {
      'assign_technician': ['EnAtención', 'Cerrado'],
      'unnassign_technician': ['Cerrado'],
      'assign_dispatcher': ['Cerrado'],
      'unnassign_dispatcher': ['Cerrado'],
      'returned': ['Cerrado'],
    };
  
    if (invalidStatesForActions[action].includes(currentState)) {
      return false;
    }
  
    return true;
  }
}
