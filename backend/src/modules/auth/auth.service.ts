import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError, NotFoundError, UnauthorizedError } from '../../shared/errors/AppError';
import { NotificationService } from '../notifications/notification.service';
import { LoginDTO, RegisterDTO } from './auth.dto';

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

    if (user.status === 'PENDING_APPROVAL') {
      throw new UnauthorizedError('Sua conta ainda está pendente de aprovação por um administrador.');
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

  /**
   * Autocadastro (tela de login -> "Criar conta") — decisão de negócio a
   * pedido do usuário. Diferente da criação pelo ADMIN_MASTER
   * (admin-user.service.ts), aqui:
   * - Só e-mails do domínio corporativo configurado podem se cadastrar.
   * - A senha nunca é escolhida pela pessoa — nasce com a senha padrão da
   *   empresa (env.DEFAULT_USER_PASSWORD), trocável depois em Meu Perfil.
   * - A conta nasce com status PENDING_APPROVAL: só pode logar depois que
   *   um ADMIN_MASTER aprovar em Admin > Usuários (mesmo endpoint de
   *   ativação já existente, PATCH /admin/users/:id).
   */
  public static async register(dto: RegisterDTO) {
    const email = dto.email.toLowerCase().trim();
    const domain = email.split('@')[1] ?? '';

    if (domain !== env.SIGNUP_ALLOWED_EMAIL_DOMAIN.toLowerCase()) {
      throw new AppError(
        `O autocadastro está disponível apenas para e-mails do domínio @${env.SIGNUP_ALLOWED_EMAIL_DOMAIN}.`,
        422,
        'EMAIL_DOMAIN_NOT_ALLOWED',
      );
    }

    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppError(`Já existe uma conta cadastrada com o e-mail '${email}'.`, 409, 'CONFLICT');
    }

    if (dto.corporateId) {
      const existingCorporateId = await prisma.user.findUnique({ where: { corporateId: dto.corporateId } });
      if (existingCorporateId) {
        throw new AppError(`Já existe uma conta cadastrada com a matrícula '${dto.corporateId}'.`, 409, 'CONFLICT');
      }
    }

    if (dto.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundError(`Departamento com ID '${dto.departmentId}' não foi encontrado.`);
    }

    const participanteRole = await prisma.role.findUnique({ where: { name: 'PARTICIPANTE' } });
    if (!participanteRole) {
      throw new AppError('Papel PARTICIPANTE não encontrado no sistema. Contate o administrador.', 500, 'ROLE_NOT_FOUND');
    }

    const passwordHash = await bcrypt.hash(env.DEFAULT_USER_PASSWORD, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email,
          passwordHash,
          corporateId: dto.corporateId,
          position: dto.position,
          departmentId: dto.departmentId,
          birthDate: dto.birthDate,
          gender: dto.gender,
          status: 'PENDING_APPROVAL',
        },
      });

      await tx.userRole.create({ data: { userId: user.id, roleId: participanteRole.id } });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SELF_REGISTER',
          entity: 'User',
          entityId: user.id,
          newValues: JSON.stringify({ name: user.name, email: user.email, status: user.status }),
        },
      });

      return user;
    });

    // Avisa todo ADMIN_MASTER que existe um cadastro esperando aprovação.
    const admins = await prisma.user.findMany({
      where: { userRoles: { some: { role: { name: 'ADMIN_MASTER' } } } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((admin) =>
        NotificationService.create({
          userId: admin.id,
          title: 'Novo cadastro pendente de aprovação 👤',
          message: `${created.name} (${created.email}) se cadastrou e está aguardando aprovação para acessar a plataforma.`,
          type: 'NEW_USER_PENDING',
          referenceId: created.id,
        }),
      ),
    );

    return {
      id: created.id,
      name: created.name,
      email: created.email,
      status: created.status,
    };
  }
}
