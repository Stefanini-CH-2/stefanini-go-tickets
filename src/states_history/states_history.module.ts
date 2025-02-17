import { Module } from '@nestjs/common';
import { StatesHistoryService } from './states_history.service';
import { StatesHistoryController } from './states_history.controller';
import { DatabaseModule } from 'stefaninigo';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import configuration from '../configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    DatabaseModule.forRootAsync([
      { name: 'mongodb', provider: DatabaseModule.PROVIDERS.MONGODB },
    ]),
    HttpModule,
  ],
  controllers: [StatesHistoryController],
  providers: [StatesHistoryService],
  exports: [StatesHistoryService],
})
export class StatesHistoryModule {}
