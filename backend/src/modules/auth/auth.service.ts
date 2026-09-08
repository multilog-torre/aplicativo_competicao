import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';
import { LoginDTO } from './auth.dto';

interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
}

// As variáveis de ambiente chegam como string livre (ex.: '7d', '30d').
// O tipo SignOptions['expiresIn'] é mais restrito, então normalizamos aqui.
const ACCESS_TOKEN_EXPIRES_IN = env.JWT_EXPIRES_IN as SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRES_IN = env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'];

export class AuthService {
  public static async login(data: LoginDTO) {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
      include: {
        department: true,
        level: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Credenciais corporativas inválidas (e-mail ou senha incorretos)');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Sua conta corporativa está inativa ou suspensa. Contate o administrador.');
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Credenciais corporativas inválidas (e-mail ou senha incorretos)');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name)
        )
      )
    );

    // Geração do Access Token JWT
    const tokenPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      roles,
    };

    const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = jwt.sign({ sub: user.id }, env.REFRESH_TOKEN_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });

    // Registra auditoria de login
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        newValues: JSON.stringify({ email: user.email, loginAt: new Date() }),
      },
    });

    return {
      user: {
        id: user.id,
        corporateId: user.corporateId,
        email: user.email,
        name: user.name,
        position: user.position,
        avatarType: user.avatarType,
        avatarUrl: user.avatarUrl,
        totalPoints: user.totalPoints,
        department: user.department ? { id: user.department.id, name: user.department.name } : null,
        level: user.level ? { id: user.level.id, number: user.level.levelNumber, name: user.level.name, badgeIcon: user.level.badgeIcon } : null,
        roles,
        permissions,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: env.JWT_EXPIRES_IN,
      },
    };
  }

  public static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: true,
        level: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Usuário não encontrado');
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name)
        )
      )
    );

    // Próximo nível para mostrar progresso
    const nextLevel = await prisma.level.findFirst({
      where: { minPoints: { gt: user.totalPoints } },
      orderBy: { minPoints: 'asc' },
    });

    return {
      id: user.id,
      corporateId: user.corporateId,
      email: user.email,
      name: user.name,
      position: user.position,
      avatarType: user.avatarType,
      avatarUrl: user.avatarUrl,
      status: user.status,
      totalPoints: user.totalPoints,
      department: user.department
        ? {
            id: user.department.id,
            name: user.department.name,
          }
        : null,
      level: user.level
        ? {
            id: user.level.id,
            levelNumber: user.level.levelNumber,
            name: user.level.name,
            minPoints: user.level.minPoints,
            badgeIcon: user.level.badgeIcon,
          }
        : null,
      nextLevel: nextLevel
        ? {
            levelNumber: nextLevel.levelNumber,
            name: nextLevel.name,
            minPoints: nextLevel.minPoints,
            pointsNeeded: nextLevel.minPoints - user.totalPoints,
          }
        : null,
      roles,
      permissions,
      createdAt: user.createdAt,
    };
  }

  public static async refreshToken(token: string) {
    try {
      const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET) as { sub: string };

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedError('Usuário inválido ou inativo para renovação de sessão');
      }

      const roles = user.userRoles.map((ur) => ur.role.name);

      const accessToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          roles,
        },
        env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
      );

      const newRefreshToken = jwt.sign({ sub: user.id }, env.REFRESH_TOKEN_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: env.JWT_EXPIRES_IN,
      };
    } catch {
      throw new UnauthorizedError('Refresh token inválido ou expirado');
    }
  }
}
