import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(email: string, senha: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const ok = await bcrypt.compare(senha, user.senhaHash);
    if (!ok) return null;
    return user;
  }

  async login(email: string, senha: string): Promise<AuthTokens> {
    const user = await this.validateUser(email, senha);
    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    return this.issueTokens(user.id, user.email, user.nome, user.role);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; email: string; nome: string; role: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }
    return this.issueTokens(payload.sub, payload.email, payload.nome, payload.role);
  }

  private async issueTokens(
    sub: string,
    email: string,
    nome: string,
    role: string,
  ): Promise<AuthTokens> {
    const base = { sub, email, nome, role };
    const accessExpiresIn = Number(this.config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? '900');
    const refreshExpiresIn = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS') ?? '604800');

    const accessToken = await this.jwt.signAsync(base, {
      secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret',
      expiresIn: accessExpiresIn,
    });
    const refreshToken = await this.jwt.signAsync(base, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET') ?? 'dev-refresh-secret',
      expiresIn: refreshExpiresIn,
    });
    return { accessToken, refreshToken };
  }
}