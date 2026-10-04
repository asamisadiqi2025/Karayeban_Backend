import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// ارسالِ ایمیل با SMTPِ استاندارد — با هر سرویسی کار می‌کند (Gmail با App Password، Brevo،
// Resend SMTP، ...). فقط با متغیرهای MAIL_* تنظیم می‌شود. اگر تنظیم نشده باشد:
//  - توسعه: متنِ ایمیل (با لینک) در لاگِ سرور چاپ می‌شود تا بشود بدون SMTP تست کرد.
//  - production: هشدار می‌دهد و لینک را هرگز در لاگ نمی‌نویسد (لینک یک رازِ امنیتی است).
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    const host = config.get<string>('MAIL_HOST');
    const port = Number(config.get<string>('MAIL_PORT') ?? 587);
    const user = config.get<string>('MAIL_USER');
    const pass = config.get<string>('MAIL_PASS');
    this.from = config.get<string>('MAIL_FROM') ?? user ?? 'no-reply@localhost';
    this.isProduction = config.get<string>('NODE_ENV') === 'production';

    this.transporter = host
      ? createTransport({
          host,
          port,
          secure: config.get<string>('MAIL_SECURE') === 'true' || port === 465,
          auth: user && pass ? { user, pass } : undefined,
        })
      : null;
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  // خطای ارسال هیچ‌وقت به کاربر برنمی‌گردد (پاسخِ forgot-password باید همیشه یکسان باشد)؛
  // فقط در لاگ ثبت می‌شود.
  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      if (this.isProduction) {
        this.logger.warn(`MAIL_HOST تنظیم نشده؛ ایمیل «${message.subject}» ارسال نشد`);
      } else {
        this.logger.log(`[DEV mail] to=${message.to} subject=${message.subject}\n${message.text}`);
      }
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (e) {
      this.logger.error(
        `ارسال ایمیل «${message.subject}» ناموفق بود`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
