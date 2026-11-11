import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from 'src/database/schemas/audit-log.schema';
import { AuditQueryDto } from './dto/audit-query.dto';
import { formatVnDateTime } from 'src/common/utils/timezone.util';

export interface CreateAuditLogParams {
  action: string;
  entityType: string;
  entityId?: string | Types.ObjectId;
  actorId?: string | Types.ObjectId;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'answerspecification',
  'correctkey',
  'acceptedanswers',
]);

function sanitizeObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date || obj instanceof Types.ObjectId) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeObject(value, depth + 1);
    }
  }
  return result;
}

function extractObjectId(ref: any): string {
  if (!ref) return '';
  if (ref instanceof Types.ObjectId) return ref.toHexString();
  if (typeof ref === 'object' && ref._id) {
    const id = ref._id;
    return id instanceof Types.ObjectId ? id.toHexString() : String(id);
  }
  return String(ref);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private auditLogModel: Model<AuditLogDocument>,
  ) {}

  /**
   * Log a security or domain audit event with sanitized metadata
   */
  async log(params: CreateAuditLogParams): Promise<AuditLogDocument> {
    try {
      const sanitizedMeta = params.metadata
        ? (sanitizeObject(params.metadata) as Record<string, unknown>)
        : undefined;

      const auditDoc = new this.auditLogModel({
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId
          ? new Types.ObjectId(params.entityId.toString())
          : undefined,
        actorId: params.actorId
          ? new Types.ObjectId(params.actorId.toString())
          : undefined,
        metadata: sanitizedMeta,
      });

      return await auditDoc.save();
    } catch (err: any) {
      this.logger.error(`Failed to record audit log for action ${params.action}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Find audit logs with pagination and filters (Admin only)
   */
  async findAll(query: AuditQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = {};
    if (query.action) {
      filter.action = query.action;
    }
    if (query.entityType) {
      filter.entityType = query.entityType;
    }
    if (query.actorId && Types.ObjectId.isValid(query.actorId)) {
      filter.actorId = new Types.ObjectId(query.actorId);
    }
    if (query.entityId && Types.ObjectId.isValid(query.entityId)) {
      filter.entityId = new Types.ObjectId(query.entityId);
    }

    const [docs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .populate('actorId', 'name fullName email role')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatAuditLog(d)),
      total,
      page,
      limit,
    };
  }

  private formatAuditLog(doc: AuditLogDocument) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      id: extractObjectId(raw._id),
      action: raw.action,
      entityType: raw.entityType,
      entityId: extractObjectId(raw.entityId),
      actorId: extractObjectId(raw.actorId),
      actor: raw.actorId && typeof raw.actorId === 'object' ? raw.actorId : undefined,
      metadata: raw.metadata,
      createdAt: raw.createdAt,
      createdAtVn: raw.createdAt ? formatVnDateTime(raw.createdAt) : undefined,
    };
  }
}
