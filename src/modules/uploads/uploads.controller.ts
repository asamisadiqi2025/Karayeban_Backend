import {
  Controller,
  Delete,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { ABSOLUTE_MAX_UPLOAD_BYTES } from './upload-categories';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { extractRequestMeta } from '../../common/audit-log/request-meta.util';

// JWT روی همهٔ روت‌ها به‌صورت سراسری در main.ts فعال است (app.useGlobalGuards)، ولی
// RolesGuard سراسری نیست — باید اینجا هم مثل بقیهٔ کنترلرها صریح اضافه شود. قبلاً این‌جا
// هیچ محدودیت نقشی نبود (هر کاربرِ لاگین‌شده، حتی STAFF، می‌توانست فایل هر کسی را پاک
// کند)؛ چون تنها مصرف‌کننده‌های واقعیِ uploads (رسید هزینه، لوگوی مارکت، عکس پروفایل
// کاربرِ دیگر) همیشه از مسیرهایی می‌آیند که خودشان به SUPER_ADMIN/ADMIN/ACCOUNTANT
// محدودند، همین سه نقش این‌جا هم اعمال شده — نه سخت‌گیرانه‌تر از چیزی که همین الان
// عملاً استفاده می‌شود.
@Controller('uploads')
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  // memoryStorage عمدی است: فایل قبل از نوشتن روی دیسک اول در سرویس اعتبارسنجی
  // (امضای واقعی، سقفِ دقیقِ دسته‌بندی) می‌شود؛ اگر رد شد، هیچ‌وقت چیزی نوشته نمی‌شود.
  @Post(':category')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ABSOLUTE_MAX_UPLOAD_BYTES },
    }),
  )
  upload(
    @Param('category') category: string,
    @UploadedFile(
      new ParseFilePipeBuilder().build({
        fileIsRequired: false,
        errorHttpStatusCode: 422,
      }),
    )
    file: Express.Multer.File | undefined,
  ) {
    return this.uploadsService.uploadFile(category, file);
  }

  @Delete()
  remove(@Req() req: any, @Query('key') storageKey: string) {
    return this.uploadsService.deleteFile(storageKey, req.user, extractRequestMeta(req));
  }
}
