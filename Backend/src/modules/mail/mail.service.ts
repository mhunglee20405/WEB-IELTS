import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromName: string;
  private readonly fromAddress: string;
  private readonly isMockMode: boolean;

  constructor(private configService: ConfigService) {
    this.fromName = this.configService.get<string>('mail.fromName', 'IELTS LMS');
    this.fromAddress = this.configService.get<string>('mail.fromAddress', 'no-reply@example.com');

    const host = this.configService.get<string>('mail.host', '');
    const isTest = this.configService.get<string>('nodeEnv') === 'test';

    // In test environment or placeholder host, use mock transport to prevent network hangs
    this.isMockMode = isTest || !host || host === 'smtp.example.com';

    if (!this.isMockMode) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port: this.configService.get<number>('mail.port', 587),
          secure: this.configService.get<boolean>('mail.secure', false),
          auth: {
            user: this.configService.get<string>('mail.user', ''),
            pass: this.configService.get<string>('mail.pass', ''),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Failed to initialize SMTP transporter: ${err.message}. Running in mock mode.`);
        this.isMockMode = true;
      }
    }
  }

  /**
   * Render predefined templates with payload
   */
  renderTemplate(templateKey: string, payload: Record<string, any> = {}): RenderedEmail {
    switch (templateKey) {
      case 'assignment-published': {
        const courseTitle = payload.courseTitle || 'Khóa học';
        const title = payload.title || 'Bài tập mới';
        const deadline = payload.deadlineAtVn || payload.deadlineAt || 'Xem chi tiết trên hệ thống';
        const subject = `[IELTS LMS] Có bài tập mới: ${title}`;
        const html = `
          <h2>Thông báo bài tập mới</h2>
          <p>Chào bạn,</p>
          <p>Lớp <strong>${courseTitle}</strong> vừa được giao bài tập mới: <strong>${title}</strong>.</p>
          <p>Hạn nộp: <strong>${deadline}</strong>.</p>
          <p>Vui lòng đăng nhập hệ thống để hoàn thành đúng hạn.</p>
        `;
        const text = `Lớp ${courseTitle} có bài tập mới: ${title}. Hạn nộp: ${deadline}.`;
        return { subject, html, text };
      }

      case 'assignment-overdue': {
        const title = payload.title || 'Bài tập';
        const subject = `[IELTS LMS] Bài tập đã quá hạn: ${title}`;
        const html = `
          <h2>Cảnh báo: Bài tập quá hạn</h2>
          <p>Chào bạn,</p>
          <p>Bài tập <strong>${title}</strong> của bạn đã quá hạn nộp hiệu lực.</p>
          <p>Hệ thống đã ghi nhận <strong>1 điểm phạt</strong> vào sổ cái vi phạm deadline.</p>
          <p>Nếu bạn có lý do chính đáng, vui lòng gửi đơn xin gia hạn để giáo viên xem xét hỗ trợ.</p>
        `;
        const text = `Bài tập ${title} đã quá hạn nộp. Hệ thống đã ghi nhận 1 điểm phạt.`;
        return { subject, html, text };
      }

      case 'course-enrolled': {
        const courseTitle = payload.courseTitle || 'Khóa học IELTS';
        const subject = `[IELTS LMS] Chào mừng bạn đến với khóa học ${courseTitle}`;
        const html = `
          <h2>Thông báo ghi danh thành công</h2>
          <p>Chào bạn,</p>
          <p>Bạn đã được thêm vào khóa học: <strong>${courseTitle}</strong>.</p>
          <p>Hãy theo dõi lịch học và các bài tập được giao trên cổng học viên.</p>
        `;
        const text = `Bạn đã được thêm vào khóa học ${courseTitle}. Chúc bạn học tốt!`;
        return { subject, html, text };
      }

      case 'extension-reviewed': {
        const title = payload.title || 'Bài tập';
        const status = payload.status === 'approved' ? 'ĐƯỢC CHẤP THUẬN' : 'BỊ TỪ CHỐI';
        const note = payload.reviewNote ? `Nhận xét: ${payload.reviewNote}` : '';
        const subject = `[IELTS LMS] Kết quả yêu cầu gia hạn bài tập: ${title}`;
        const html = `
          <h2>Kết quả xét duyệt gia hạn</h2>
          <p>Chào bạn,</p>
          <p>Yêu cầu xin gia hạn bài tập <strong>${title}</strong> của bạn đã <strong>${status}</strong>.</p>
          ${note ? `<p><strong>${note}</strong></p>` : ''}
          <p>Vui lòng kiểm tra lại hạn nộp mới trên hệ thống.</p>
        `;
        const text = `Yêu cầu xin gia hạn bài tập ${title} đã ${status}. ${note}`;
        return { subject, html, text };
      }

      default: {
        const subject = payload.subject || `[IELTS LMS] Thông báo hệ thống`;
        const html = payload.body ? `<p>${payload.body}</p>` : `<p>Thông báo từ IELTS LMS</p>`;
        const text = payload.body || 'Thông báo từ IELTS LMS';
        return { subject, html, text };
      }
    }
  }

  /**
   * Dispatch email via Nodemailer or structured log in mock mode
   */
  async sendMail(options: SendMailOptions): Promise<{ messageId: string }> {
    const from = `"${this.fromName}" <${this.fromAddress}>`;

    if (this.isMockMode || !this.transporter) {
      const mockId = `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.logger.log(`[MOCK EMAIL DISPATCH] To: ${options.to} | Subject: ${options.subject} | ID: ${mockId}`);
      return { messageId: mockId };
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      return { messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${options.to}: ${err.message}`);
      throw err;
    }
  }
}

