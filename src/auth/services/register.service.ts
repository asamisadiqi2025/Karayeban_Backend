import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from '../dto/register.dto';
import { generateId } from '../../common/utils/uuid.util';

@Injectable()
export class RegisterService {

  private readonly logger = new Logger(RegisterService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const normalizedUsername = dto.username.toLowerCase().trim();
    const normalizedEmail = dto.email?.toLowerCase().trim();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: normalizedUsername },
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ],
        deletedAt: null,
      },
      select: { id: true, username: true, email: true },
    });

    if (existingUser) {
      const field =
        existingUser.username === normalizedUsername ? 'username' : 'email';
      this.logger.warn(`Registration attempt with existing ${field}: ${normalizedUsername}`);
      throw new ConflictException(`User with this ${field} already exists`);
    }

    try {
      const passwordHash = await hash(dto.password, this.BCRYPT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          id: generateId(),
          name: dto.name.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
        },
      });

      this.logger.log(`User registered: ${user.username} (${user.id})`);

      return user;
    } catch (error) {
      this.logger.error('Registration failed', error);
      throw new InternalServerErrorException('Registration failed');
    }
  }
}
