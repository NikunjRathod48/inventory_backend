import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles('Admin', 'Staff')
  create(@Body() createOrderDto: CreateOrderDto, @CurrentUser('userId') userId: string) {
    return this.ordersService.create(createOrderDto, userId);
  }

  @Get()
  @Roles('Admin', 'Staff')
  findAll(@Query() query: { page?: string; limit?: string; search?: string }) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @Roles('Admin', 'Staff')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/cancel')
  @Roles('Admin', 'Staff')
  cancelOrder(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.ordersService.cancelOrder(id, userId);
  }
}
