import { Module } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { DatabaseModule } from 'stefaninigo';

@Module({
  imports: [
    DatabaseModule.forRootAsync([
      { name: 'mongodb', provider: DatabaseModule.PROVIDERS.MONGODB },
    ]),
  ],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
