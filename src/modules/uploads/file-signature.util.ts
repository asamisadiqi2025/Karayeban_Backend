// تشخیصِ نوعِ واقعیِ فایل از روی بایت‌های اولش (magic number) — نه از mimetype‌ای که
// کلاینت در هدر فرستاده، چون آن به‌راحتی جعل‌شدنی است (یک .exe را می‌شود با
// Content-Type: image/png فرستاد). فقط همان ۴ نوعی که این پروژه لازم دارد پشتیبانی
// می‌شود؛ برای طیفِ وسیع‌تر باید از کتابخانه‌ای مثل file-type استفاده کرد.
const SIGNATURES: { mime: string; check: (buf: Buffer) => boolean }[] = [
  { mime: 'image/png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', check: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  {
    mime: 'image/webp',
    check: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  { mime: 'application/pdf', check: (b) => b.subarray(0, 4).toString('ascii') === '%PDF' },
];

export function detectMimeFromBuffer(buffer: Buffer): string | null {
  const match = SIGNATURES.find((s) => s.check(buffer));
  return match?.mime ?? null;
}

export const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};
