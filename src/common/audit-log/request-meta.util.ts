import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

// پشتِ یک reverse proxy (Coolify/Nginx) آی‌پیِ واقعیِ کلاینت در x-forwarded-for است، نه
// در req.ip (که آدرسِ پراکسی را می‌دهد) — اولین مقدار در لیست، کلاینتِ اصلی است.
export function extractRequestMeta(req: Request): RequestMeta {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]?.trim();

  return {
    ip: forwardedIp || req.ip || null,
    userAgent: req.headers['user-agent'] || null,
  };
}
