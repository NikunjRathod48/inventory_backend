import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, StockTransactionType } from './dto/adjust-stock.dto';

@Injectable()
export class StockService {
  constructor(private prisma: PrismaService) {}

  /**
   * Add stock (PURCHASE, RETURN, CANCEL_ORDER) — increases quantity.
   * Deduct stock (SALE, ADJUSTMENT) — decreases quantity.
   * All mutations happen inside a Prisma transaction with full history logging.
   */
  async adjustStock(dto: AdjustStockDto, userId: string) {
    const addTypes: string[] = [
      StockTransactionType.PURCHASE,
      StockTransactionType.RETURN,
      StockTransactionType.CANCEL_ORDER,
    ];
    const isAddition = addTypes.includes(dto.transactiontype);

    return this.prisma.$transaction(async (tx) => {
      // Lock the stock row by reading it, or create if missing
      let stock = await tx.stock.findUnique({
        where: { productid: dto.productid },
      });

      if (!stock) {
        stock = await tx.stock.create({
          data: {
            productid: dto.productid,
            quantity: 0,
            lowstockthreshold: 5,
          }
        });
      }

      const previousQuantity = stock.quantity;
      let newQuantity: number;

      if (isAddition) {
        newQuantity = previousQuantity + dto.quantity;
      } else {
        newQuantity = previousQuantity - dto.quantity;
        if (newQuantity < 0) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${previousQuantity}, Requested: ${dto.quantity}`,
          );
        }
      }

      // Update the stock quantity
      await tx.stock.update({
        where: { stockid: stock.stockid },
        data: {
          quantity: newQuantity,
          updatedat: new Date(),
        },
      });

      // Create transaction log
      await tx.stocktransactions.create({
        data: {
          productid: dto.productid,
          transactiontype: dto.transactiontype,
          quantity: dto.quantity,
          previousquantity: previousQuantity,
          newquantity: newQuantity,
          referenceid: dto.referenceid || null,
          notes: dto.notes || null,
          createdby: userId,
        },
      });

      return {
        productid: dto.productid,
        previousQuantity,
        newQuantity,
        change: isAddition ? `+${dto.quantity}` : `-${dto.quantity}`,
        transactiontype: dto.transactiontype,
      };
    }, {
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /**
   * Get current stock for all products with product details.
   */
  async findAll(query: {
    page?: number | string;
    limit?: number | string;
    search?: string;
    lowStockOnly?: boolean | string;
  }) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 10;
    const isLowStockOnly = query.lowStockOnly === 'true' || query.lowStockOnly === true;
    
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isactive: true,
    };

    if (query.search) {
      where.OR = [
        { productname: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (isLowStockOnly) {
      const allProducts = await this.prisma.products.findMany({
        where,
        include: { categories: true, stock: true },
        orderBy: { productname: 'asc' },
      });

      let data = allProducts.map((p) => {
        const stockInfo = p.stock || { quantity: 0, lowstockthreshold: 5, stockid: `virtual-${p.productid}`, productid: p.productid };
        return {
          ...stockInfo,
          products: {
            productid: p.productid,
            productname: p.productname,
            barcode: p.barcode,
            categories: p.categories,
          }
        };
      });

      data = data.filter((s) => s.quantity <= (s.lowstockthreshold ?? 5));
      const total = data.length;
      const paginatedData = data.slice(skip, skip + limitNum);

      return {
        data: paginatedData,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    }

    const [productsList, total] = await Promise.all([
      this.prisma.products.findMany({
        where,
        include: {
          categories: true,
          stock: true,
        },
        orderBy: { productname: 'asc' },
        skip,
        take: limitNum,
      }),
      this.prisma.products.count({ where }),
    ]);

    let data = productsList.map((p) => {
      const stockInfo = p.stock || { quantity: 0, lowstockthreshold: 5, stockid: `virtual-${p.productid}`, productid: p.productid };
      return {
        ...stockInfo,
        products: {
          productid: p.productid,
          productname: p.productname,
          barcode: p.barcode,
          categories: p.categories,
        }
      };
    });

    return {
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get low stock and out of stock alerts.
   */
  async getLowStockAlerts() {
    const allProducts = await this.prisma.products.findMany({
      where: { isactive: true },
      include: {
        categories: true,
        stock: true,
      },
    });

    const mappedStocks = allProducts.map((p) => {
      const stockInfo = p.stock || { quantity: 0, lowstockthreshold: 5, stockid: null, productid: p.productid };
      return {
        ...stockInfo,
        products: p,
      };
    });

    const lowStock = mappedStocks.filter(
      (s) => s.quantity > 0 && s.quantity <= (s.lowstockthreshold ?? 5),
    );

    const outOfStock = mappedStocks.filter((s) => s.quantity === 0);

    return {
      lowStock,
      outOfStock,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
    };
  }

  /**
   * Get stock transaction history for a specific product.
   */
  async getTransactionHistory(
    productId: string,
    query: { page?: number | string; limit?: number | string },
  ) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
      this.prisma.stocktransactions.findMany({
        where: { productid: productId },
        include: {
          users: {
            select: { fullname: true, email: true },
          },
        },
        orderBy: { createdat: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.stocktransactions.count({
        where: { productid: productId },
      }),
    ]);

    const serializedTransactions = transactions.map((t) => ({
      ...t,
      transactionid: t.transactionid.toString(),
    }));

    return {
      data: serializedTransactions,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Update low stock threshold for a product.
   */
  async updateThreshold(productId: string, threshold: number) {
    let stock = await this.prisma.stock.findUnique({
      where: { productid: productId },
    });

    if (!stock) {
      return this.prisma.stock.create({
        data: {
          productid: productId,
          quantity: 0,
          lowstockthreshold: threshold,
        }
      });
    }

    return this.prisma.stock.update({
      where: { stockid: stock.stockid },
      data: { lowstockthreshold: threshold },
    });
  }
}
