-- audit_logs باید append-only باشد: هیچ کاربردی نباید بتواند رکورد audit را عوض یا
-- پاک کند، وگرنه کل جدول از نظر یک حسابرس بی‌ارزش می‌شود (قابل دستکاری). این محدودیت
-- عمداً به‌جای REVOKE UPDATE/DELETE با trigger پیاده شده: REVOKE برای owner جدول اثری
-- ندارد (owner همیشه از GRANT/REVOKE عبور می‌کند)، و در این پروژه اپلیکیشن با همان نقشی
-- به دیتابیس وصل می‌شود که owner جداول هم هست. trigger این محدودیت را در سطح خودِ جدول
-- اعمال می‌کند — مستقل از این‌که کدام نقش دیتابیس درخواست را می‌فرستد.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
