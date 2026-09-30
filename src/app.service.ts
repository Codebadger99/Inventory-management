import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { Create } from './dto/create-inventory';
import { Update } from './dto/update-inventory';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) { }
  async getAll() {
    return this.prisma.inventory.findMany();
  }

  async getOne(id: number) {
    return this.prisma.inventory.findUnique({
      where: {
        id
      }
    })
  }

  async createInventory(create: Create) {
    return this.prisma.inventory.create({
      data: {
        ...create
      }
    })
  }

  async updateInventory(id: number, update: Update) {
    return this.prisma.inventory.update({
      where: {
        id: id,
      },
      data: update

    })
  }

  async deleteInventory(id: number) {
    return this.prisma.inventory.delete({
      where: {
        id
      }
    })
  }

}
