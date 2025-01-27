import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { NewStateTicketDto } from './dto/newstate-ticket.dto';

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
    private readonly stateMachine: StateMachineService,
  ) { }

  async create(tickets: Ticket | Ticket[]) {
    const createdAt = new Date().toISOString();
    const mapTechniciansAndDispatchers = async (ticket) => {
      const technicians = await Promise.all(
        ticket.technicians?.map((tech) => this.getEmployeeById(tech?.id)),
      );
      const dispatchers = await Promise.all(
        ticket.dispatchers?.map((disp) => this.getEmployeeById(disp?.id)),
      );
      return {
        ...ticket,
        technicians: technicians?.map((tech) => ({
          id: tech.id,
          role: tech.role,
          name: `${tech.firstName} ${tech.firstSurname}`.trim(),
          fullName: `${tech.firstName} ${tech.firstSurname}`.trim(),
          phone: tech.phone,
          email: tech.email,
          enabled: true,
        })),
        dispatchers: dispatchers?.map((disp) => ({
          id: disp.id,
          role: disp.role,
          name: `${disp.firstName} ${disp.firstSurname}`.trim(),
          fullName: `${disp.firstName} ${disp.firstSurname}`.trim(),
          phone: disp.phone,
          email: disp.email,
          enabled: true,
        })),
      };
    };

    if (Array.isArray(tickets)) {
      const ticketWithDetails = await Promise.all(
        tickets.map(mapTechniciansAndDispatchers),
      );
      await this.databaseService.create(ticketWithDetails, this.collectionName);
      return ticketWithDetails.map((ticket) => ticket.id);
    } else {
      const ticketWithDetails = await mapTechniciansAndDispatchers(tickets);
      const id = uuidv4().toString();
      await this.databaseService.create(
        {
          id,
          ...ticketWithDetails,
          createdAt,
        },
        this.collectionName,
      );
      await this.updateState(id, 'created');
      if (ticketWithDetails.dispatcher?.some((disp) => disp.enabled)) {
        await this.updateState(id, 'dispatcher_assigned');
      }
      if (ticketWithDetails.technicians?.some((tech) => tech.enabled)) {
        await this.updateState(id, 'technician_assigned');
      }
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

  async updateState(ticketId: string, newState: string, newStateTicket?: NewStateTicketDto): Promise<any> {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const stateMachine = await this.stateMachine.getStateMachine(
      ticket.commerceId,
    );
    const targetState = stateMachine?.states?.find(
      (state) => state.id === newState,
    );
    if (
      !this.stateMachine.isTransitionAllowed(
        stateMachine,
        ticket.currentState?.id,
        targetState?.id,
      ) ||
      !targetState
    ) {
      throw new BadRequestException(
        `Transición inválida de '${ticket.currentState?.label || ticket.currentState?.id || ticket.currentState}' a '${targetState?.label || targetState?.id || newState}'.`,
      );
    }

    if (newState === 'in_service') {
      const technicians =
        ticket.technicians?.filter((tech) => tech.enabled) || [];
      if (technicians.length === 0) {
        throw new BadRequestException('No hay técnicos asignados al ticket.');
      }

      const technicianIds = technicians?.map((tech) => tech.id);

      const busyTickets = await this.databaseService.list(
        0,
        1,
        {
          filters: {
            'technicians.id': technicianIds,
            'technicians.enabled': 'true',
            'currentState.id': 'in_service',
          },
          exclude: {
            id: ticketId,
          },
        },
        this.collectionName,
      );

      if (Array.isArray(busyTickets) && busyTickets.length > 0) {
        throw new ForbiddenException(
          'El técnico asignado ya está atendiendo otro ticket.',
        );
      }
    }
    const updatedAt = new Date().toISOString();
    if (newState === 'coordinate') {
      if (newStateTicket) {
        if (!newStateTicket?.customs?.coordinatedDate) throw new NotFoundException('Para coordinar debes enviar una fecha de coordinación.');
        ticket.coordinatedDate = newStateTicket.customs.coordinatedDate;
        const contact = await this.databaseService.get(newStateTicket?.customs?.coordinatedContactId, 'contacts')
        if (!contact) throw new NotFoundException('Contacto no encontrado');
        ticket.coordinatedContactId = contact.id;
        await this.updateTicketField(ticketId, {
          coordinatedContactId: ticket?.coordinatedContactId,
          coordinatedDate: ticket?.coordinatedDate,
        });
      }
    }

    
    await this.updateTicketField(ticketId, {
      currentState: { id: targetState?.id, label: targetState?.label },
      updatedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      ticket.dispatchers,
      ticket.technicians,
      { coordinatedDate: ticket?.coordinatedDate, coordinatedContactId: ticket?.coordinatedContactId }
    );

    return `Estado actualizado a ${targetState?.label} con éxito para el ticket ${ticket.ticket_number}`;
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
      disptachersId,
      techniciansId,
    } = this.mapFieldsIds(tickets);
    const records = await this.processFlows(tickets, {
      ticketsId,
      commercesId,
      branchesId,
      categoriesId,
      subcategoriesId,
      contactsId,
      disptachersId,
      techniciansId,
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
        acc.disptachersId?.push(
          ...ticket.dispatchers?.map((disptacher) => disptacher.id),
        );
        acc.techniciansId?.push(
          ...ticket.technicians?.map((technician) => technician.id),
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
        disptachersId: [],
        techniciansId: [],
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
      disptachersId,
      techniciansId,
    } = this.mapFieldsIds([ticket]);

    const records = await this.processFlows([ticket], {
      ticketsId,
      commercesId,
      branchesId,
      categoriesId,
      subcategoriesId,
      contactsId,
      disptachersId,
      techniciansId,
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
      disptachersId,
      techniciansId,
    },
  ) {
    const LIMIT = 100;

    const [
      commercesList,
      branchesList,
      categoriesList,
      subcategoriesList,
      contactsList,
      disptachersList,
      techniciansList,
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
        { filters: { id: disptachersId } },
        'employees',
      ),
      this.databaseService.list(
        0,
        LIMIT,
        { filters: { id: techniciansId } },
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
        { filters: { ticketId: ticketsId }, sort: { endDate: 'desc' } },
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
        disptachersList,
        techniciansList,
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
        elements.dispatchers,
        elements.technicians,
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
    disptachersList,
    techniciansList,
    statesHistoryList,
    commentsList,
    evidencesList,
    devicesList,
    categoriesList,
    subcategoriesList,
    appointmentsList,
  ) {
    const commerce = commercesList?.find(
      (commerce) => commerce.id === ticket.commerceId,
    );
    const branch = branchesList?.find(
      (branch) => branch.id === ticket.branchId,
    );
    const category = categoriesList?.find(
      (category) => category.id === ticket.categoryId,
    );
    const subcategory = subcategoriesList?.find(
      (subcategory) => subcategory.id === ticket.subcategoryId,
    );

    const contacts = contactsList?.filter(
      (contact) => contact.commerceId === ticket.commerceId,
    );
    const dispatchers = Array.isArray(ticket.dispatchers)
      ? disptachersList?.filter((disptacher) =>
        ticket.dispatchers?.map((c) => c.id)?.includes(disptacher.id),
      )
      : [];
    const technicians = Array.isArray(ticket.technicians)
      ? techniciansList?.filter((technician) =>
        ticket.technicians?.map((t) => t.id)?.includes(technician.id),
      )
      : [];

    const statesHistory = statesHistoryList
      ?.filter((history) => history.ticketId === ticket.id)
      ?.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    const comments = commentsList?.filter(
      (comment) => comment.ticketId === ticket.id,
    );
    const evidences = evidencesList?.filter(
      (evidence) => evidence.ticketId === ticket.id,
    );
    const devices = devicesList?.filter((device) =>
      evidences?.some((evidence) => evidence.id === device.evidenceId),
    );
    const appointments = appointmentsList?.filter(
      (appointment) => appointment.ticketId === ticket.id,
    );

    return {
      ticket,
      commerce,
      branch,
      contacts,
      dispatchers,
      technicians,
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
    ticket: {
      ticketOriginalJson: any;
      id: any;
      ticket_number: any;
      description: any;
      createAt: any;
      updateAt: any;
      plannedDate: any;
      coordinatedDate: any;
      coordinatedContactId: any;
      sla: any;
      numSla: any;
      dateSla: any;
      attentionType: any;
      createdAt: any;
      priority: any;
      currentState: any;
      technicians: any[];
      dispatchers: any[];
    },
    commerce: {
      id: any;
      rut: any;
      name: any;
      observation: any;
      services: any;
      logoFileName: any;
    },
    branch: {
      id: any;
      rut: any;
      address: any;
      city: any;
      region: any;
      commune: any;
      coords: { latitude: any; longitude: any };
      name: any;
      observation: any;
    },
    contacts: any[],
    dispatchers: any[],
    technicians: any[],
    statesHistory:
      | any[]
      | { items: any[]; lastEvaluatedKey?: Record<string, any> },
    _comments: any[] | { items: any[]; lastEvaluatedKey?: Record<string, any> },
    _evidences:
      | any[]
      | { items: any[]; lastEvaluatedKey?: Record<string, any> },
    _devices: any,
    category: { _id: any },
    subcategory: { _id: any },
    appointments: any,
    attentionType: { values: any[] },
    priority: { values: any[] },
  ) {
    const evidences = Utils.mapRecord(Evidence, _evidences);

    const techApprovalId = evidences?.[0]?.approvals?.[0]?.userId;

    const techApproval = technicians?.find(
      (tech) => tech.id === techApprovalId,
    );
    if (evidences?.length > 0) {
      evidences[0].approvals[0].fullName = `${techApproval['firstName']} ${techApproval['firstSurname']}`;
    }

    delete category?._id;
    delete subcategory?._id;

    const allEmployees = [...dispatchers, ...technicians];

    const comments = Utils.mapRecord(Comment, _comments);

    const commentsWithEmployeeNames = comments?.map((comment) => {
      const employee = allEmployees?.find(
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
        coordinatedDate: ticket?.coordinatedDate,
        coordinatedContactId: ticket?.coordinatedContactId,
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
        originalTicket: ticket.ticketOriginalJson
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
      dispatchers: dispatchers?.map((disptacher) => {
        const dispatcherInfo = ticket.dispatchers?.find(
          (disp) => disp.id === disptacher?.id,
        );
        return {
          id: dispatcherInfo?.id || disptacher?.id,
          role: dispatcherInfo?.role || disptacher?.role,
          provider: dispatcherInfo?.provider || disptacher?.provider,
          rut: disptacher?.rut,
          enabled: dispatcherInfo?.enabled,
          fullName:
            dispatcherInfo?.name ||
            `${disptacher?.firstName || ''} ${disptacher?.secondName || ''} ${disptacher?.firstSurname || ''} ${disptacher?.secondSurname || ''}`
              .trim()
              .replace(/\s+/g, ' '),
          phone: disptacher?.phone,
          email: disptacher?.email,
        };
      }),
      technicians: ticket.technicians?.map((technician) => {
        const technicianInfo = technicians?.find(
          (tech) => tech?.id === technician?.id,
        );
        technicians;
        return {
          id: technician?.id,
          role: technicianInfo?.role || technician.role,
          fullName:
            `${technicianInfo.firstName || ''} ${technicianInfo.secondName || ''} ${technicianInfo.firstSurname || ''} ${technicianInfo.secondSurname || ''}`
              .trim()
              .replace(/\s+/g, ' '),
          rut: technicianInfo.dniNumber || '',
          phone: technicianInfo?.phone,
          email: technicianInfo?.email,
          provider: technicianInfo.provider || technician.provider,
          enabled: technician?.enabled,
          assignmentDate: technicianInfo?.assignmentDate,
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
    techniciansId?: string[],
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
    if (techniciansId && techniciansId.length > 0) {
      filters['technicians.id'] = techniciansId;
    }

    let { records: tickets } = await this.listFlows(0, 1000000, {
      filters: filters,
      sort: { createdAt: 'desc' },
      search: { ticket_number: ticketNumber },
    });

    if (techniciansId?.length) {
      tickets = tickets
        ?.map((ticket) => ({
          ...ticket,
          technicians: ticket.technicians?.filter(
            (tech) => tech.enabled && techniciansId?.includes(tech.id),
          ),
        }))
        ?.filter((ticket) => ticket.technicians.length > 0);
    }

    if (regions && regions.length > 0) {
      tickets = tickets?.filter((ticket) =>
        regions?.includes(ticket.branch.location.region),
      );
    }

    if (startDate && endDate) {
      tickets = tickets?.filter(
        (ticket) =>
          ticket.ticket.createdAt >= startDate &&
          ticket.ticket.createdAt <= endDate,
      );
    }

    if (!Array.isArray(tickets)) return {};

    const ticketsByStatus = this.transformTicketsByStatus(tickets);

    const uniqueCommercesMap = new Map();
    const uniqueTechniciansMap = new Map();

    tickets?.forEach((ticket) => {
      const commerce = ticket.commerce;
      uniqueCommercesMap?.set(commerce.id, commerce.name);
    });

    tickets?.forEach((ticket) => {
      const technicians = ticket.technicians;
      technicians?.forEach((technician) => {
        uniqueTechniciansMap?.set(technician.id,  {
          id: technician.id,
          fullName: technician.fullName,
          provider: technician.provider,
          role: technician.role,
          enabled: technician.enabled,
        });
      });
    });

    const clients = Array.from(uniqueCommercesMap, ([id, name]) => ({
      id,
      name,
    }));

    const technicians = Array.from(uniqueTechniciansMap.values());

    const filtersSummary = {
      clients: clients,
      regions: [
        ...new Set(tickets?.map((ticket) => ticket.branch?.location?.region)),
      ]?.map((region) => ({ name: region })),
      technicians: technicians,
    };

    const newTickets = tickets?.map((ticket) => ticket.ticket);

    const ticketStatuses = newTickets?.reduce(
      (acc: Record<string, number>, { currentState }) => {
        const _currentState = currentState?.id.replace(' ', '');
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

    tickets?.forEach((ticket) => {
      const createdAt = new Date(ticket.ticket.createdAt).toISOString();

      const now = new Date().toISOString().split('T')[0];
      const transformedTicket: TransformedTicket = {
        id: ticket.ticket.id,
        ticketNumber: ticket.ticket.ticket_number,
        createdAt,
        region: ticket.branch.location.region,
        comuna: ticket.branch.location.commune,
        coordinatedAt: ticket.ticket?.coordinatedDate,
        technician: ticket.technicians?.[0]?.fullName || 'N/A',
      };

      if (ticket.ticket.currentState.id === 'coordinate') {
        if(!transformedTicket.coordinatedAt){
          transformedTicket.coordinatedAt = ticket.appointments?.[0]?.endDate;
        }
        const coordinatedAt = transformedTicket.coordinatedAt ? new Date(
          transformedTicket.coordinatedAt,
        ).toISOString() : null;
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

      const currentStateId = ticket.ticket.currentState?.id?.replace(' ', '');
      if (!ticketsByStatus[currentStateId]) {
        ticketsByStatus[currentStateId] = [];
      }

      ticketsByStatus[currentStateId].push(transformedTicket);
    });
    return ticketsByStatus;
  }

  async assignTechnician(
    ticketId: string,
    technicianId: string,
    dispatcherId: string,
  ) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const technician = await this.getEmployeeById(technicianId);
    if (!technician) throw new NotFoundException('Técnico no encontrado');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatcher no encontrado');

    const currentlyAssignedTechnician = ticket.technicians?.find(
      (tech) => tech.id === technicianId && tech.enabled,
    );
    if (currentlyAssignedTechnician) {
      return `El técnico ${technician.firstName} ${technician.firstSurname} ya está asignado al ticket ${ticket.ticket_number}.`;
    }

    // Validación de permisos
    if (
      dispatcher.role !== EmployeeRole.ADMIN &&
      dispatcher.provider !== technician.provider
    ) {
      throw new ForbiddenException(
        'Los dispatchers solo pueden asignar técnicos de su propio proveedor',
      );
    }

    // Validación de transición en la máquina de estados
    const stateMachine = await this.stateMachine.getStateMachine(
      ticket.commerceId,
    );
    const targetState = stateMachine?.states?.find(
      (state) => state.id === 'technician_assigned',
    );
    if (
      !this.stateMachine.isTransitionAllowed(
        stateMachine,
        ticket.currentState?.id,
        targetState?.id,
      )
    ) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState?.label} a ${targetState?.label} no está permitida`,
      );
    }

    const updatedAt = new Date().toISOString();

    const updatedTechnicians = [
      ...ticket.technicians?.map((tech) => {
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
        fullName: `${technician.firstName} ${technician.firstSurname}`,
        assignedBy: dispatcherId,
        assignedAt: updatedAt,
        enabled: true,
      },
    ];

    await this.updateTicketField(ticketId, {
      technicians: updatedTechnicians,
      currentState: { id: targetState.id, label: targetState.label },
      updatedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      ticket.dispatchers,
      updatedTechnicians,
    );

    return `El técnico ${technician.firstName} ${technician.firstSurname} ha sido asignado exitosamente al ticket ${ticket.ticket_number} por el dispatchers ${dispatcher.firstName} ${dispatcher.firstSurname}.`;
  }

  async unassignTechnician(
    ticketId: string,
    technicianId: string | null,
    dispatcherId: string,
  ) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatchers no encontrado');

    let technicianToUnassign;

    if (!technicianId) {
      technicianToUnassign = ticket.technicians?.find((tech) => tech.enabled);
      if (!technicianToUnassign) {
        return 'No hay técnicos asignados actualmente';
      }
      technicianId = technicianToUnassign.id;
    } else {
      technicianToUnassign = ticket.technicians?.find(
        (tech) => tech.id === technicianId,
      );
      if (!technicianToUnassign)
        throw new NotFoundException('Técnico no encontrado en este ticket');
    }

    if (
      dispatcher.role !== EmployeeRole.ADMIN &&
      dispatcher.provider !== technicianToUnassign.provider
    ) {
      throw new ForbiddenException(
        'No está autorizado para desasignar técnicos de otro proveedor',
      );
    }

    if (!technicianToUnassign.enabled) {
      return 'El técnico ya estaba desasignado';
    }

    const stateMachine = await this.stateMachine.getStateMachine(
      ticket.commerceId,
    );
    const targetState = stateMachine?.states?.find(
      (state) => state.id === 'technician_unassigned',
    );
    if (
      !this.stateMachine.isTransitionAllowed(
        stateMachine,
        ticket.currentState?.id,
        targetState?.id,
      )
    ) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState?.label} a ${targetState?.label} no está permitida`,
      );
    }

    const unassignedAt = new Date().toISOString();

    const updatedTechnicians = ticket.technicians?.map((tech) => {
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
      technicians: updatedTechnicians,
      currentState: { id: targetState.id, label: targetState.label },
      updatedAt: unassignedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      ticket.dispatchers,
      updatedTechnicians,
    );

    return `El técnico ${technicianToUnassign.name} ha sido desasignado exitosamente del ticket ${ticket.ticket_number} por el dispatchers ${dispatcher.firstName} ${dispatcher.firstSurname}.`;
  }

  async assignDispatcher(
    ticketId: string,
    newDispatcherId: string,
    currentDispatcherId: string,
  ) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket no encontrado');

    const currentDispatcher = await this.getEmployeeById(currentDispatcherId);
    if (!currentDispatcher)
      throw new NotFoundException('Dispatcher actual no encontrado');

    const newDispatcher = await this.getEmployeeById(newDispatcherId);
    if (!newDispatcher)
      throw new NotFoundException('Nuevo dispatcher no encontrado');

    const currentlyAssignedDispatcher = ticket.dispatchers?.find(
      (dispatcher) => dispatcher.id === newDispatcherId && dispatcher.enabled,
    );
    if (currentlyAssignedDispatcher) {
      throw new ConflictException(
        `El dispatcher ${currentlyAssignedDispatcher.name} ya está asignado al ticket ${ticket.ticket_number}.`,
      );
    }

    if (currentDispatcher.provider === Provider.STEFANINI) {
      if (
        currentDispatcher.role !== EmployeeRole.ADMIN &&
        currentDispatcher.role !== EmployeeRole.DISPATCHER
      ) {
        throw new ForbiddenException(
          'Solo los administradores o dispatchers de Stefanini pueden asignar dispatchers proveedores.',
        );
      }
    } else {
      if (
        newDispatcher.provider !== currentDispatcher.provider &&
        newDispatcher.provider !== Provider.STEFANINI
      ) {
        throw new ForbiddenException(
          'Los dispatchers de otros proveedores solo pueden asignar a dispatchers de su mismo proveedor o de Stefanini.',
        );
      }
    }

    const stateMachine = await this.stateMachine.getStateMachine(
      ticket.commerceId,
    );
    const targetState = stateMachine?.states?.find(
      (state) => state.id === 'dispatcher_assigned',
    );
    if (
      !this.stateMachine.isTransitionAllowed(
        stateMachine,
        ticket.currentState?.id,
        targetState?.id,
      )
    ) {
      throw new ForbiddenException(
        `La transición de ${ticket.currentState?.label} a ${targetState?.label} no está permitida`,
      );
    }

    const updatedAt = new Date().toISOString();

    const updatedDispatchers = [
      ...ticket.dispatchers?.map((dispatcher) => {
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
        fullName: `${newDispatcher.firstName} ${newDispatcher.firstSurname}`,
        assignedBy: currentDispatcherId,
        assignedAt: updatedAt,
        enabled: true,
      },
    ];

    const updatedTechnicians = ticket.technicians?.map((tech) => {
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
      dispatchers: updatedDispatchers,
      technicians: updatedTechnicians,
      currentState: { id: targetState?.id, label: targetState?.label },
      updatedAt,
    });

    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetState,
      updatedDispatchers,
      updatedTechnicians,
    );

    const targetStateTechnicianUnassigned = stateMachine?.states?.find(
      (state) => state.id === 'technician_unassigned',
    );
    await this.stateMachine.recordStateChange(
      ticket.commerceId,
      ticketId,
      ticket.currentState,
      targetStateTechnicianUnassigned,
      updatedDispatchers,
      updatedTechnicians,
    );

    return `El dispatcher ${newDispatcher.firstName} ${newDispatcher.firstSurname} ha sido asignado exitosamente al ticket ${ticket.ticket_number} por el dispatcher ${currentDispatcher.firstName} ${currentDispatcher.firstSurname}. Todos los técnicos asignados previamente han sido desasignados.`;
  }

  async unassignDispatcher(ticketId: string, dispatcherId: string) {
    const ticket = await this.getTicketById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const dispatcher = await this.getEmployeeById(dispatcherId);
    if (!dispatcher) throw new NotFoundException('Dispatcher not found');

    if (dispatcher.role !== EmployeeRole.ADMIN) {
      throw new ForbiddenException(
        'Only Stefanini admins can unassign dispatchers',
      );
    }

    const unassignedAt = new Date().toISOString();

    const updatedDispatchers = ticket.dispatchers?.map((dispatcher) => {
      if (dispatcher.id === dispatcherId && dispatcher.enabled) {
        return {
          ...dispatcher,
          enabled: false,
          unassignedBy: dispatcherId,
          unassignedAt,
        };
      }
      return dispatcher;
    });

    const anyEnabled = ticket.dispatchers.some(
      (dispatcher) => dispatcher.id === dispatcherId && dispatcher.enabled,
    );
    if (!anyEnabled) {
      return 'There is not dispatchers enabled to unassign';
    }

    await this.updateTicketField(ticketId, { dispatchers: updatedDispatchers });

    // Cambiar el estado del ticket y crear historial
    //await this.changeTicketState(ticketId, 'unnassign_dispatcher', dispatcherId, null, ticket.currentState);
    return `Dispatcher ${dispatcherId} successfully unassigned from ticket ${ticketId}.`;
  }

  private async getEmployeeById(employeeId: string) {
    return await this.databaseService.get(employeeId, this.employeesCollection);
  }

  private async updateTicketField(
    ticketId: string,
    fields: Partial<UpdateTicketDto>,
  ) {

    return await this.databaseService.update(
      ticketId,
      fields,
      this.collectionName,
    );
  }

  private async getTicketById(ticketId: string) {
    return await this.databaseService.get(ticketId, this.collectionName);
  }
}
