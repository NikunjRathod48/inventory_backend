import {
  Controller, Get, Post, Put,
  Body, Param, Query, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { StockService } from './stock.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockController {
  constructor(private stockService: StockService) {}

  @Post('adjust')
  @Roles('Admin')
  adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.stockService.adjustStock(dto, userId);
  }

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('lowStockOnly') lowStockOnly?: boolean,
  ) {
    return this.stockService.findAll({ page, limit, search, lowStockOnly });
  }

  @Get('alerts')
  getLowStockAlerts() {
    return this.stockService.getLowStockAlerts();
  }

  @Get('history/:productId')
  getTransactionHistory(
    @Param('productId') productId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.stockService.getTransactionHistory(productId, { page, limit });
  }

  @Put('threshold/:productId')
  @Roles('Admin')
  updateThreshold(
    @Param('productId') productId: string,
    @Body('threshold', ParseIntPipe) threshold: number,
  ) {
    return this.stockService.updateThreshold(productId, threshold);
  }
}
