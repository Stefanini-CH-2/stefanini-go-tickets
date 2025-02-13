import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { DatabaseModule, StorageModule } from 'stefaninigo';
import { StateMachineService } from './state_machine.service';
import { StatesHistoryService } from 'src/states_history/states_history.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    DatabaseModule.forRootAsync([
      { name: 'mongodb', provider: DatabaseModule.PROVIDERS.MONGODB },
      { name: 's3', provider: StorageModule.PROVIDERS.S3 },
    ]),
    HttpModule,
  ],
  controllers: [TicketController],
  providers: [TicketService, StatesHistoryService, StateMachineService],
  exports: [StateMachineService],
})
export class TicketModule {}
