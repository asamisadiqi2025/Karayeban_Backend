import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { JwtService } from '@nestjs/jwt';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,

    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [
          {
            username: dto.username.toLowerCase(),
          },

          {
            email: dto.email?.toLowerCase() || '',
          },
        ],
      },
    });

    if (exists) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,

        username: dto.username.toLowerCase(),

        email: dto.email,

        passwordHash,
      },
    });

    return {
      id: user.id,

      name: user.name,

      username: user.username,

      email: user.email,
    };
  }

    async login(dto: LoginDto) {

        console.log('Login DTO:', dto); // Log the incoming DTO for debugging
      const user = await this.prisma.user.findUnique({
        where: {
          username: dto.username.toLowerCase(),
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const valid = await bcrypt.compare(dto.password, user.passwordHash);

      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const accessToken = this.jwtService.sign({
        sub: user.id,

        username: user.username,
      });

      await this.prisma.user.update({
        where: {
          id: user.id,
        },

        data: {
          updatedAt: new Date(),
        },
      });

      return {
        accessToken,

        user: {
          id: user.id,

          name: user.name,

          username: user.username,
        },
      };
    }


}
