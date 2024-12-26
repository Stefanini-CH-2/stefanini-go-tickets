export class TicketEntity {
  attentionType: string;
  commerceId: string;
  technicians: TechnicianEntity[];
  currentState: {
    name: string;
    id: string;
  };
}

class TechnicianEntity {
  id: string;
  provider?: string;
  role?: string;
  name?: string;
  assignedBy?: string;
  assignedAt?: string;
  enabled: boolean;
}
