import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              if (key === 'nodeEnv') return 'test';
              if (key === 'mail.fromName') return 'IELTS LMS';
              if (key === 'mail.fromAddress') return 'test@ielts.local';
              if (key === 'mail.host') return 'smtp.example.com';
              return def;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('renders assignment-published template correctly', () => {
    const rendered = service.renderTemplate('assignment-published', {
      courseTitle: 'IELTS Intensive 7.5',
      title: 'Reading Test 1',
      deadlineAtVn: '23:59 20/11/2026',
    });

    expect(rendered.subject).toContain('Reading Test 1');
    expect(rendered.html).toContain('IELTS Intensive 7.5');
    expect(rendered.html).toContain('23:59 20/11/2026');
  });

  it('renders assignment-overdue template correctly', () => {
    const rendered = service.renderTemplate('assignment-overdue', {
      title: 'Listening Test 2',
    });

    expect(rendered.subject).toContain('Listening Test 2');
    expect(rendered.html).toContain('1 điểm phạt');
  });

  it('renders extension-reviewed template correctly', () => {
    const rendered = service.renderTemplate('extension-reviewed', {
      title: 'Writing Task 1',
      status: 'approved',
      reviewNote: 'Đồng ý hoãn 2 ngày',
    });

    expect(rendered.subject).toContain('Writing Task 1');
    expect(rendered.html).toContain('ĐƯỢC CHẤP THUẬN');
    expect(rendered.html).toContain('Đồng ý hoãn 2 ngày');
  });

  it('dispatches email in mock mode in test environment', async () => {
    const res = await service.sendMail({
      to: 'student@ielts.local',
      subject: 'Test Subject',
      html: '<p>Test Body</p>',
    });

    expect(res).toBeDefined();
    expect(res.messageId).toContain('mock-email-');
  });
});

