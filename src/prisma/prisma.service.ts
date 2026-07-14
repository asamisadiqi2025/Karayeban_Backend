// import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { PrismaPg } from '@prisma/adapter-pg';
// import { PrismaClient } from '../generated/prisma/client';

// @Injectable()
// export class PrismaService implements OnModuleInit, OnModuleDestroy {
//   private readonly client: PrismaClient;

//   constructor(private readonly configService: ConfigService) {
//     const adapter = new PrismaPg({
//       connectionString: this.configService.getOrThrow<string>('DATABASE_URL'),
//     });

//     this.client = new PrismaClient({
//       adapter,
//     });
//   }

//   get prisma(): PrismaClient {
//     return this.client;
//   }

//   async onModuleInit() {
//     await this.client.$connect();
//   }

//   async onModuleDestroy() {
//     await this.client.$disconnect();
//   }
// }


import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';


@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {


  constructor(
    private readonly configService: ConfigService
  ) {

    const adapter = new PrismaPg({
      connectionString:
        configService.getOrThrow<string>('DATABASE_URL'),
    });


    super({
      adapter,
    });

  }



  async onModuleInit() {
    await this.$connect();
  }



  async onModuleDestroy() {
    await this.$disconnect();
  }

}