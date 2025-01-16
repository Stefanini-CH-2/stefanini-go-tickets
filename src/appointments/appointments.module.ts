import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { DatabaseModule } from 'stefaninigo';

@Module({
  imports: [
    DatabaseModule.forRootAsync([
      { name: 'mongodb', provider: DatabaseModule.PROVIDERS.MONGODB },
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
