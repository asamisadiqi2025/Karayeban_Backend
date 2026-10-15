#!/bin/sh
set -e

# زمانِ هر مرحلهٔ راه‌اندازی در لاگِ کانتینر (Coolify) دیده شود تا اگر دوباره کند شد معلوم باشد کجاست.
log() { echo "[entrypoint] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Prisma CLI به‌صورت پیش‌فرض هنگامِ اجرا به اینترنت وصل می‌شود (checkpoint.prisma.io برای «نسخهٔ جدید هست؟») و npx هم
# ممکن است رجیستری npm را بپرسد. روی سروری که خروجیِ اینترنتش کند یا فیلتر است، هر اتصال تا timeout معطل می‌کند و
# راه‌اندازی دقیقه‌ها طول می‌کشد (healthcheck پیش از آماده‌شدنِ اپ شکست می‌خورد و Coolify به نسخهٔ قبلی برمی‌گردد).
# هیچ‌کدام برای migrate لازم نیست.
export CHECKPOINT_DISABLE=1
export PRISMA_HIDE_UPDATE_MESSAGE=1

log "prisma migrate deploy: start"
if [ -x ./node_modules/.bin/prisma ]; then
  ./node_modules/.bin/prisma migrate deploy
else
  npx prisma migrate deploy
fi
log "prisma migrate deploy: done, starting the app"

exec node dist/main.js
