import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class UpdateBackupSettingsDto {
  // بک‌آپِ خودکارِ روزانهٔ این مارکت روشن/خاموش. ساعتِ بک‌آپ برای همهٔ مارکت‌ها یکی است و با
  // BACKUP_TIME در تنظیماتِ سرور مشخص می‌شود.
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  autoBackupEnabled: boolean;
}
