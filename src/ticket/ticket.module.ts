import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { DatabaseModule } from 'stefaninigo';
import { StateMachineService } from './state_machine.service';
import { StatesHistoryService } from 'src/states_history/states_history.service';

@Module({
  imports: [
    DatabaseModule.forRootAsync([
      { name: 'mongodb', provider: DatabaseModule.PROVIDERS.MONGODB },
    ]),
  ],
  controllers: [TicketController],
  providers: [TicketService, StatesHistoryService, StateMachineService],
  exports: [StateMachineService],
})
export class TicketModule {}
