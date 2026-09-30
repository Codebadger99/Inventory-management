import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    databaseUrl.searchParams.set('sslmode', 'verify-full');

    const adapter = new PrismaPg({
      connectionString: databaseUrl.toString(),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}