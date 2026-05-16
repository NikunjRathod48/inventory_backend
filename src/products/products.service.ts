import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // Check unique product name
    const existingName = await this.prisma.products.findUnique({
      where: { productname: dto.productname.trim() },
    });
    if (existingName) {
      throw new ConflictException('A product with this name already exists');
    }

    // Check unique barcode
    if (dto.barcode) {
      const existingBarcode = await this.prisma.products.findUnique({
        where: { barcode: dto.barcode.trim() },
      });
      if (existingBarcode) {
        throw new ConflictException('A product with this barcode already exists');
      }
    }

    const product = await this.prisma.products.create({
      data: {
        productname: dto.productname.trim(),
        categoryid: dto.categoryid,
        description: dto.description?.trim() || null,
        price: dto.price,
        costprice: dto.costprice ?? null,
        barcode: dto.barcode?.trim() || null,
        isactive: true,
      },
      include: {
        categories: true,
        stock: true,
      },
    });

    // Auto-create stock entry for the new product
    await this.prisma.stock.create({
      data: {
        productid: product.productid,
        quantity: 0,
        lowstockthreshold: 5,
      },
    });

    return this.findOne(product.productid);
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    categoryid?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      limit = 10,
      search,
      categoryid,
      status,
      sortBy = 'createdat',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    // By default show only active products
    if (status === 'inactive') {
      where.isactive = false;
    } else if (status === 'all') {
      // Show all
    } else {
      where.isactive = true;
    }

    if (search) {
      where.OR = [
        { productname: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (categoryid) {
      where.categoryid = categoryid;
    }

    const orderBy: any = {};
    const allowedSortFields = ['productname', 'price', 'costprice', 'createdat'];
    if (allowedSortFields.includes(sortBy)) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdat = 'desc';
    }

    const [products, total] = await Promise.all([
      this.prisma.products.findMany({
        where,
        include: {
          categories: true,
          stock: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.products.count({ where }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.products.findUnique({
      where: { productid: id },
      include: {
        categories: true,
        stock: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);

    // Check unique product name
    if (dto.productname && dto.productname.trim() !== product.productname) {
      const existing = await this.prisma.products.findUnique({
        where: { productname: dto.productname.trim() },
      });
      if (existing) {
        throw new ConflictException('A product with this name already exists');
      }
    }

    // Check unique barcode
    if (dto.barcode && dto.barcode.trim() !== product.barcode) {
      const existing = await this.prisma.products.findUnique({
        where: { barcode: dto.barcode.trim() },
      });
      if (existing) {
        throw new ConflictException('A product with this barcode already exists');
      }
    }

    return this.prisma.products.update({
      where: { productid: id },
      data: {
        ...(dto.productname && { productname: dto.productname.trim() }),
        ...(dto.categoryid !== undefined && { categoryid: dto.categoryid }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.costprice !== undefined && { costprice: dto.costprice }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode?.trim() || null }),
      },
      include: {
        categories: true,
        stock: true,
      },
    });
  }

  async softDelete(id: string) {
    await this.findOne(id);

    await this.prisma.products.update({
      where: { productid: id },
      data: { isactive: false },
    });

    return { message: 'Product deleted successfully' };
  }
}
