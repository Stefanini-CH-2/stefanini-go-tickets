import {
    PipeTransform,
    Injectable,
    BadRequestException,
    ArgumentMetadata,
} from '@nestjs/common';

@Injectable()
export class ParseJsonPipe<T> implements PipeTransform<string, T> {
    constructor(private readonly targetType: new () => T) { }

    transform(value: string, metadata: ArgumentMetadata): T {
        if (!value) {
            return undefined;
        }
        try {
            return JSON.parse(value) as T;
        } catch (error) {
            throw new BadRequestException(`Invalid JSON format for ${metadata.data}`);
        }
    }
}
