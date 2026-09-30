import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

function getDatabaseConnectionString(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error('DATABASE_URL is missing. Set it in the Render service Environment settings.');
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL. Set it to the PostgreSQL connection string, without surrounding quotes.');
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
  }

  databaseUrl.searchParams.set('sslmode', 'verify-full');
  return databaseUrl.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: getDatabaseConnectionString(),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}