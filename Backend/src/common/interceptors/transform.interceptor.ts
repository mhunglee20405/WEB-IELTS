import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode,
        data: this.normalize(data),
        timestamp: new Date().toISOString(),
      })),
    );
  }

  private normalize(val: any, seen = new WeakSet()): any {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    if (val instanceof Date || val instanceof RegExp) return val;

    if (val._bsontype === 'ObjectID' || val._bsontype === 'ObjectId') {
      return val.toString();
    }

    if (typeof (val as any).toJSON === 'function' && typeof (val as any).toObject !== 'function') {
      try {
        val = (val as any).toJSON();
      } catch {
        // retain original val
      }
    }

    if (val === null || val === undefined || typeof val !== 'object') return val;
    if (val instanceof Date || val instanceof RegExp) return val;

    if (seen.has(val)) return val;
    seen.add(val);

    if (Array.isArray(val)) {
      return val.map((item) => this.normalize(item, seen));
    }

    if (val instanceof Map) {
      const obj: Record<string, any> = {};
      val.forEach((v, k) => {
        obj[k] = this.normalize(v, seen);
      });
      return obj;
    }

    const plain =
      typeof (val as any).toObject === 'function'
        ? (val as any).toObject({ virtuals: true })
        : { ...val };

    if (plain._id && !plain.id) {
      plain.id = plain._id.toString();
    }

    if (plain.role && !plain.roles && typeof plain.role === 'string') {
      plain.roles = [plain.role];
    }
    if (Array.isArray(plain.roles) && !plain.role && plain.roles.length > 0) {
      plain.role = plain.roles[0];
    }

    for (const key of Object.keys(plain)) {
      if (plain[key] && typeof plain[key] === 'object') {
        plain[key] = this.normalize(plain[key], seen);
      }
    }

    return plain;
  }
}
