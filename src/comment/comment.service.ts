import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { DatabaseService, QueryParams } from 'stefaninigo';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommentService {
  private collectionName: string = 'comments';
  constructor(
    @Inject('mongodb') private readonly databaseService: DatabaseService,
  ) {}

  async create(comments: CreateCommentDto | CreateCommentDto[]) {
    const createdAt = new Date().toISOString();
    if (Array.isArray(comments)) {
      const commentWithIds = comments.map((comment) => ({
        id: uuidv4().toString(),
        ...comment,
        createdAt,
      }));
      await this.databaseService.create(commentWithIds, this.collectionName);
      return commentWithIds.map((comment) => comment.id);
    } else {
      const id = uuidv4().toString();
      await this.databaseService.create(
        {
          id,
          ...comments,
          createdAt,
        },
        this.collectionName,
      );
      return [id];
    }
  }

  async get(id: string) {
    const comment = await this.databaseService.get(id, this.collectionName);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  async delete(id: string) {
    const comment = await this.databaseService.get(id, this.collectionName);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    await this.databaseService.delete(id, this.collectionName);

    return 'Comment deleted successfully';
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

  async update(id: string, comment: UpdateCommentDto) {
    const updatedAt = new Date().toISOString();
    comment['updatedAt'] = updatedAt;
    return (
      (await this.databaseService.update(id, comment, this.collectionName)) &&
      'Update successful'
    );
  }
}
