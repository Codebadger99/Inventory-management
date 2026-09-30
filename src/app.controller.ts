import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { Create } from './dto/create-inventory';
import { Update } from './dto/update-inventory';

@Controller()
export class AppController {
  constructor(private readonly inventory: AppService) { }

  @Get()
  findAll() {
    return this.inventory.getAll()
  }

  @Get(':id')
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.inventory.getOne(id)
  }


  @Post()
  createOne(@Body() create: Create) {
    return this.inventory.createInventory(create)
  }

  @Patch(':id')
  updateOne(@Param("id", ParseIntPipe) id: number, @Body() update: Update) {
    return this.inventory.updateInventory(id, update)
  }

  @Delete(":id")
  deleteOne(@Param("id", ParseIntPipe) id: number) {
    return this.inventory.deleteInventory(id)
  }
}
