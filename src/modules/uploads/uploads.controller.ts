import {
  Controller,
  Delete,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from './uploads.service';
import { ABSOLUTE_MAX_UPLOAD_BYTES } from './upload-categories';

// JWT روی همهٔ روت‌ها به‌صورت سراسری در main.ts فعال است (app.useGlobalGuards) — نیازی
// به @UseGuards تکراری اینجا نیست. محدودیتِ واقعیِ «کی اجازه دارد» جای دیگری اعمال
// می‌شود: همان endpointـی که از URLِ برگشتی استفاده می‌کند (مثلاً PATCH /market/profile
// که خودش @Roles دارد) — نه اینجا. این endpoint فقط «فایل را بگیر، URL بده».
@Controller('uploads')
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
  remove(@Query('key') storageKey: string) {
    return this.uploadsService.deleteFile(storageKey);
  }
}
