import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

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

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Check if email is already taken by another user
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser && existingUser.userid !== userId) {
      throw new ConflictException('This email is already in use');
    }

    const updatedUser = await this.prisma.users.update({
      where: { userid: userId },
      data: {
        fullname: dto.fullname.trim(),
        email: dto.email.toLowerCase().trim(),
      },
      select: {
        userid: true,
        fullname: true,
        email: true,
        role: true,
      },
    });

    return updatedUser;
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.users.findUnique({
      where: { userid: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordhash);
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid current password');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.users.update({
      where: { userid: userId },
      data: { passwordhash: newPasswordHash },
    });

    return { message: 'Password updated successfully' };
  }
}
