// src/users.controller.ts
import {
   Controller,
   Get,
   NotFoundException,
   Body,
   Post
   } from "@nestjs/common";

import { CreateUserDto } from "./dto/create-user.dto";

@Controller('users')
export class UsersController {
  
  @Get('test-error')
  testError() {
    throw new NotFoundException('Test error: resource not found');
  }

  @Post()
  create(@Body()  CreateUserDto: CreateUserDto){

    return {
      message: "Validation passed",
      data: CreateUserDto
    }
 

 }
}
