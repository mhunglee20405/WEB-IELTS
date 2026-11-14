import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { AuditService } from './audit.service';
import { AuditLog } from 'src/database/schemas/audit-log.schema';

describe('AuditService', () => {
  let service: AuditService;
  let auditModelMock: any;

  beforeEach(async () => {
    function MockAuditDoc(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.createdAt = new Date();
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    auditModelMock = MockAuditDoc;
    auditModelMock.find = jest.fn();
    auditModelMock.countDocuments = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken(AuditLog.name), useValue: auditModelMock },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('creates an audit log with redacted sensitive credentials and answer keys', async () => {
    const actorId = new Types.ObjectId();
    const entityId = new Types.ObjectId();

    const result = await service.log({
      action: 'EXTENSION_REQUEST_REVIEWED',
      entityType: 'ExtensionRequest',
      entityId,
      actorId,
      metadata: {
        note: 'Approved extension',
        password: 'SecretPassword123',
        token: 'Bearer sensitive-token',
        answerSpecification: { correctKey: 'A' },
      },
    });

    expect(result).toBeDefined();
    expect(result.action).toBe('EXTENSION_REQUEST_REVIEWED');
    expect(result.metadata).toBeDefined();
    expect((result.metadata as any).password).toBe('[REDACTED]');
    expect((result.metadata as any).token).toBe('[REDACTED]');
    expect((result.metadata as any).answerSpecification).toBe('[REDACTED]');
    expect((result.metadata as any).note).toBe('Approved extension');
  });

  it('queries audit logs with pagination and filters', async () => {
    auditModelMock.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    });

    auditModelMock.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });

    const res = await service.findAll({ page: 1, limit: 10, action: 'EXTENSION_REQUEST_REVIEWED' });
    expect(res.page).toBe(1);
    expect(res.total).toBe(0);
    expect(res.items).toEqual([]);
  });
});

