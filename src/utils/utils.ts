import { plainToClass } from 'class-transformer';

export class Utils {
  static mapRecord = <T>(
    cls: new () => T,
    records: any[] | { items: any[]; lastEvaluatedKey?: Record<string, any> },
  ): T[] => {
    if (Array.isArray(records)) {
      return records.map((record) => plainToClass(cls, record));
    } else {
      return records.items?.map((item) => plainToClass(cls, item));
    }
  };
}
