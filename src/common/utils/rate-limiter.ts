// محدودکنندهٔ ساده با پنجرهٔ لغزان، در حافظه — برای route های عمومیِ حساس (بازیابی رمز) که
// بدون آن می‌شود صندوقِ ایمیلِ یک ادمین را پر کرد یا لینک‌ها را حدس زد. سرور فعلاً تک‌نمونه است؛
// اگر روزی چند نمونه شد باید به Redis منتقل شود.
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  // true = مجاز (و همین تلاش ثبت شد)، false = از سقف گذشته.
  hit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    this.sweep(now, windowMs);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= windowMs)) this.hits.delete(key);
    }
  }
}
