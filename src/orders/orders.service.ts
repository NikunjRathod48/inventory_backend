import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOrderDto, userId: string) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const orderItemsData: any[] = [];

      for (const item of dto.items) {
        // 1. Check stock
        const stock = await tx.stock.findUnique({
          where: { productid: item.productid },
          include: { products: { select: { productname: true } } }
        });

        if (!stock || stock.quantity < item.quantity) {
          let productName = stock?.products?.productname;
          if (!productName) {
            const productFallback = await tx.products.findUnique({ where: { productid: item.productid } });
            productName = productFallback?.productname || item.productid;
          }
          throw new BadRequestException(`Insufficient stock for: ${productName}`);
        }

        // 2. Deduct stock
        const newQuantity = stock.quantity - item.quantity;
        await tx.stock.update({
          where: { stockid: stock.stockid },
          data: { quantity: newQuantity, updatedat: new Date() },
        });

        // 3. Log stock transaction
        await tx.stocktransactions.create({
          data: {
            productid: item.productid,
            transactiontype: 'SALE',
            quantity: item.quantity,
            previousquantity: stock.quantity,
            newquantity: newQuantity,
            notes: 'Order sale',
            createdby: userId,
          },
        });

        const itemTotal = Number(item.unitprice) * item.quantity;
        totalAmount += itemTotal;

        orderItemsData.push({
          productid: item.productid,
          quantity: item.quantity,
          unitprice: item.unitprice,
          totalprice: itemTotal,
        });
      }

      // 4. Create Order
      const order = await tx.orders.create({
        data: {
          customername: dto.customername || 'Walk-in Customer',
          totalamount: totalAmount,
          status: 'CONFIRMED',
          createdby: userId,
          orderitems: {
            create: orderItemsData,
          },
        },
        include: {
          orderitems: {
            include: { products: { select: { productname: true } } }
          },
          users: { select: { fullname: true } }
        }
      });

      // 5. Generate Invoice
      const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      const invoice = await tx.invoices.create({
        data: {
          orderid: order.orderid,
          invoicenumber: invoiceNumber,
        },
      });

      return {
        ...order,
        orderitems: order.orderitems.map((i) => ({
          ...i,
          orderitemid: i.orderitemid.toString(),
        })),
        invoices: invoice,
      };
    }, {
      maxWait: 5000,
      timeout: 10000,
    });
  }

  async findAll(query: { page?: number | string; limit?: number | string; search?: string }) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (query.search) {
      where.customername = { contains: query.search, mode: 'insensitive' };
    }

    const [orders, total] = await Promise.all([
      this.prisma.orders.findMany({
        where,
        include: {
          invoices: true,
          users: { select: { fullname: true } },
          orderitems: {
            include: { products: { select: { productname: true } } }
          }
        },
        orderBy: { orderdate: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.orders.count({ where }),
    ]);

    const serializedOrders = orders.map(o => {
      return {
        ...o,
        orderitems: o.orderitems.map(i => ({ ...i, orderitemid: i.orderitemid.toString() }))
      }
    });

    return {
      data: serializedOrders,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.orders.findUnique({
      where: { orderid: id },
      include: {
        invoices: true,
        users: { select: { fullname: true } },
        orderitems: {
          include: { products: true }
        }
      }
    });

    if (!order) throw new NotFoundException('Order not found');

    return {
      ...order,
      orderitems: order.orderitems.map(i => ({ ...i, orderitemid: i.orderitemid.toString() }))
    };
  }

  async cancelOrder(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.orders.findUnique({
        where: { orderid: id },
        include: { orderitems: true }
      });

      if (!order) throw new NotFoundException('Order not found');
      if (order.status === 'CANCELLED') throw new BadRequestException('Order is already cancelled');

      // Restock items
      for (const item of order.orderitems) {
        if (!item.productid) continue;
        
        const stock = await tx.stock.findUnique({
          where: { productid: item.productid },
        });

        if (stock) {
          const newQuantity = stock.quantity + item.quantity;
          await tx.stock.update({
            where: { stockid: stock.stockid },
            data: { quantity: newQuantity, updatedat: new Date() },
          });

          await tx.stocktransactions.create({
            data: {
              productid: item.productid,
              transactiontype: 'CANCEL_ORDER',
              quantity: item.quantity,
              previousquantity: stock.quantity,
              newquantity: newQuantity,
              notes: `Order ${order.orderid} cancelled`,
              createdby: userId,
            },
          });
        }
      }

      // Update order status
      return tx.orders.update({
        where: { orderid: id },
        data: {
          status: 'CANCELLED',
          cancelledat: new Date(),
        },
      });
    }, {
      maxWait: 5000,
      timeout: 10000,
    });
  }
}
