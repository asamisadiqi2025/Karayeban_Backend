import { Params } from 'nestjs-pino';

// لاگِ عملیاتی (Pino) — جدا از AuditLog: این‌جا برای دیباگ/observability است («سیستم
// الان چه‌کار می‌کند، کجا کند شد»)، نه برای حسابرسیِ مالی. بدنهٔ request/response عمداً
// لاگ نمی‌شود (نه سرعتش، نه نشتِ داده‌های مالی/محرمانه)؛ فقط چیزی که pino-http پیش‌فرض
// می‌دهد (method, url, statusCode, responseTime, req id).
export const loggerConfig = (): Params => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),

      transport: isProduction
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },

      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[REDACTED]',
      },

      // فایل‌های استاتیک (uploads) و health-check را لاگ نکن — نویزِ بی‌فایده در هر
      // سطرِ لاگِ عملیاتی.
      autoLogging: {
        ignore: (req) => {
          const url = (req as { url?: string }).url ?? '';
          return url.startsWith('/uploads');
        },
      },
    },
  };
};
