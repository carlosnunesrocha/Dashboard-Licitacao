import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException('Email já cadastrado');

    const senhaHash = await bcrypt.hash(dto.senha, 12);
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash,
        role: dto.role ?? 'membro',
      },
      select: { id: true, nome: true, email: true, role: true, createdAt: true },
    });
    return user;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, nome: true, email: true, role: true, createdAt: true },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, nome: true, email: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.senha) {
      data.senhaHash = await bcrypt.hash(dto.senha, 12);
      delete data.senha;
    }
    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, nome: true, email: true, role: true, createdAt: true },
    });
    return user;
  }

  async remove(id: string) {
    await this.findOne(id); // throws 404 if missing
    await this.prisma.user.delete({ where: { id } });
  }
}