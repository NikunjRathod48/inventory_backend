import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(page: number | string = 1, limit: number | string = 10, search?: string) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: any = { isactive: true };
    if (search) {
      where.OR = [
        { fullname: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        select: {
          userid: true,
          fullname: true,
          email: true,
          role: true,
          isactive: true,
          createdat: true,
        },
        orderBy: { createdat: 'desc' },
        skip,
        take: limitNum,
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async findById(userId: string) {
    return this.prisma.users.findUnique({
      where: { userid: userId },
      select: {
        userid: true,
        fullname: true,
        email: true,
        role: true,
        isactive: true,
        createdat: true,
      },
    });
  }
}
