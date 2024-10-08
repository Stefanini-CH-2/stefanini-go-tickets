import { Module } from '@nestjs/common';
import { TicketModule } from './ticket/ticket.module';
import { EvidenceModule } from './evidence/evidence.module';
import { CommentModule } from './comment/comment.module';
import { StatesHistoryModule } from './states_history/states_history.module';
import { DeviceModule } from './device/device.module';
import { ConfigModule } from '@nestjs/config';
import { AppointmentsModule } from './appointments/appointments.module';
import configuration from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    TicketModule, 
    DeviceModule, 
    StatesHistoryModule, 
    CommentModule, 
    EvidenceModule, 
    AppointmentsModule
  ],
  providers: [],
})
export class AppModule {}
