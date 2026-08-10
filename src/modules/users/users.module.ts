// src/modules/user/user.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
@Module({
  controllers: [UsersController], // 👈 Register it here
  providers: [], 
})
export class UserModule {}
