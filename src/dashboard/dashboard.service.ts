import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(userRole: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalProducts, lowStockCount, todaysOrders] = await Promise.all([
      this.prisma.products.count({ where: { isactive: true } }),
      // Raw query for low stock where quantity <= lowstockthreshold
      this.prisma.$queryRaw<{count: bigint}[]>`SELECT COUNT(*) FROM stock WHERE quantity <= lowstockthreshold`,
      this.prisma.orders.count({ where: { orderdate: { gte: today }, status: { not: 'CANCELLED' } } })
    ]);

    let todaysRevenue = 0;
    
    // Only fetch revenue if user is Admin
    if (userRole === 'Admin') {
      const revenueAggr = await this.prisma.orders.aggregate({
        _sum: { totalamount: true },
        where: { orderdate: { gte: today }, status: { not: 'CANCELLED' } }
      });
      todaysRevenue = Number(revenueAggr._sum.totalamount || 0);
    }

    return {
      totalProducts,
      lowStockCount: Number(lowStockCount[0].count),
      todaysOrders,
      todaysRevenue: userRole === 'Admin' ? todaysRevenue : null
    };
  }

  async getSalesChart(userRole: string) {
    if (userRole !== 'Admin') return [];

    // Get last 7 days of sales
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const orders = await this.prisma.orders.findMany({
      where: {
        orderdate: { gte: sevenDaysAgo },
        status: { not: 'CANCELLED' }
      },
      select: {
        orderdate: true,
        totalamount: true
      }
    });

    // Aggregate by day
    const grouped = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      grouped[dateStr] = 0;
    }

    orders.forEach(o => {
      const orderDate = o.orderdate ? new Date(o.orderdate) : new Date();
      const dateStr = orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (grouped[dateStr] !== undefined) {
        grouped[dateStr] += Number(o.totalamount);
      }
    });

    return Object.entries(grouped).map(([date, sales]) => ({ date, sales }));
  }

  async getRecentActivity() {
    const [recentOrders, lowStockItems] = await Promise.all([
      this.prisma.orders.findMany({
        take: 5,
        orderBy: { orderdate: 'desc' },
        include: { invoices: true, users: { select: { fullname: true } } }
      }),
      // Find items where quantity <= lowstockthreshold
      this.prisma.$queryRaw`SELECT p.productname, s.quantity, s.lowstockthreshold FROM stock s JOIN products p ON s.productid = p.productid WHERE s.quantity <= s.lowstockthreshold ORDER BY s.quantity ASC LIMIT 5`
    ]);

    return {
      recentOrders,
      lowStockItems
    };
  }
}
