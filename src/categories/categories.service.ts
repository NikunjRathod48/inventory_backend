import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.categories.findUnique({
      where: { categoryname: dto.categoryname.trim() },
    });

    if (existing) {
      throw new ConflictException('Category with this name already exists');
    }

    return this.prisma.categories.create({
      data: { categoryname: dto.categoryname.trim() },
    });
  }

  async findAll() {
    return this.prisma.categories.findMany({
      orderBy: { categoryname: 'asc' },
      include: {
        _count: { select: { products: true } },
      },
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.categories.findUnique({
      where: { categoryid: id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.findOne(id);

    if (dto.categoryname) {
      const existing = await this.prisma.categories.findUnique({
        where: { categoryname: dto.categoryname.trim() },
      });
      if (existing && existing.categoryid !== id) {
        throw new ConflictException('Category with this name already exists');
      }
    }

    return this.prisma.categories.update({
      where: { categoryid: id },
      data: { categoryname: dto.categoryname?.trim() },
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    const productCount = await this.prisma.products.count({
      where: { categoryid: id, isactive: true },
    });

    if (productCount > 0) {
      throw new ConflictException(
        'Cannot delete category with active products. Remove or reassign products first.',
      );
    }

    await this.prisma.categories.delete({ where: { categoryid: id } });
    return { message: 'Category deleted successfully' };
  }
}
