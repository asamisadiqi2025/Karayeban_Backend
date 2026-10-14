// کابل UTC+۰۴:۳۰ ثابت است (تغییرِ ساعتِ تابستانی ندارد).
export const KABUL_OFFSET_MINUTES = 270;

// «تاریخ تقویمیِ» یک لحظه در وقتِ کابل، به‌صورت نیمه‌شبِ UTC — تا با ستون‌های @db.Date (که فقط روز
// دارند) مستقیم قابل‌مقایسه باشد و نتیجه به تایم‌زونِ سرور بستگی نداشته باشد.
export function kabulDate(instant: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kabul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return new Date(`${ymd}T00:00:00.000Z`);
}

// لحظهٔ واقعیِ (UTC) ساعتِ «HH:mm» به وقتِ کابل در همان روزِ تقویمیِ کابلِ `instant`.
export function kabulTimeOnSameDay(instant: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(kabulDate(instant).getTime() + (h * 60 + m - KABUL_OFFSET_MINUTES) * 60_000);
}
