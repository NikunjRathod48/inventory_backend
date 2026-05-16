import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !user.isactive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordhash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: user.userid,
      email: user.email,
      role: user.role,
      fullname: user.fullname,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        userid: user.userid,
        fullname: user.fullname,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const saltRounds = 10;
    const passwordhash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.users.create({
      data: {
        fullname: dto.fullname.trim(),
        email: dto.email.toLowerCase().trim(),
        passwordhash,
        role: dto.role,
        isactive: true,
      },
    });

    return {
      userid: user.userid,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      createdat: user.createdat,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { userid: userId },
      select: {
        userid: true,
        fullname: true,
        email: true,
        role: true,
        createdat: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
