import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { CreateUserDTO, ListUsersQueryDTO, SetUserRolesDTO, UpdateUserDTO } from './admin-user.dto';

function toPublicShape(user: {
  id: string;
  corporateId: string | null;
  name: string;
  email: string;
  position: string | null;
  status: string;
  totalPoints: number;
  createdAt: Date;
  department: { id: string; name: string } | null;
  userRoles: Array<{ role: { name: string } }>;
}) {
  return {
    id: user.id,
    corporateId: user.corporateId,
    name: user.name,
    email: user.email,
    position: user.position,
    status: user.status,
    totalPoints: user.totalPoints,
    department: user.department,
    roles: user.userRoles.map((ur) => ur.role.name),
    createdAt: user.createdAt,
  };
}

const USER_INCLUDE = {
  department: { select: { id: true, name: true } },
  userRoles: { include: { role: { select: { name: true } } } },
} as const;

export class AdminUserService {
  /**
   * Gestão de contas — criação, edição e controle de acesso administrativo.
   * Restrito a ADMIN_MASTER (governança da plataforma), assim como a
   * auditoria (Fase 9): quem pode criar uma conta ou conceder acesso de
   * admin a outra pessoa é, por natureza, uma decisão de mais alto nível.
   */
  public static async list(query: ListUsersQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { email: { contains: query.search } }];
    }
    if (query.role) {
      where.userRoles = { some: { role: { name: query.role } } };
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: USER_INCLUDE,
      }),
    ]);

    return {
      users: users.map(toPublicShape),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  public static async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!user) throw new NotFoundError(`Usuário com ID '${id}' não foi encontrado.`);
    return toPublicShape(user);
  }

  public static async create(dto: CreateUserDTO, adminId: string) {
    const existingEmail = await prisma.user.findUnique({ where: { email: dto.email.toLowerCase().trim() } });
    if (existingEmail) throw new AppError(`Já existe um usuário com o e-mail '${dto.email}'.`, 409, 'CONFLICT');

    if (dto.corporateId) {
      const existingCorporateId = await prisma.user.findUnique({ where: { corporateId: dto.corporateId } });
      if (existingCorporateId) {
        throw new AppError(`Já existe um usuário com a matrícula '${dto.corporateId}'.`, 409, 'CONFLICT');
      }
    }

    if (dto.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundError(`Departamento com ID '${dto.departmentId}' não foi encontrado.`);
    }

    const roles = await prisma.role.findMany({ where: { name: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new AppError('Um ou mais perfis informados são inválidos.', 422, 'INVALID_ROLE');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          corporateId: dto.corporateId,
          position: dto.position,
          departmentId: dto.departmentId ?? undefined,
        },
      });

      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: user.id, roleId: r.id })) });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'CREATE_USER',
          entity: 'User',
          entityId: user.id,
          // Nunca registrar senha em texto/hash na auditoria.
          newValues: JSON.stringify({ name: user.name, email: user.email, roles: dto.roles }),
        },
      });

      return tx.user.findUniqueOrThrow({ where: { id: user.id }, include: USER_INCLUDE });
    });

    return toPublicShape(created);
  }

  public static async update(id: string, dto: UpdateUserDTO, adminId: string) {
    const existing = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!existing) throw new NotFoundError(`Usuário com ID '${id}' não foi encontrado.`);

    if (id === adminId && dto.status === 'INACTIVE') {
      throw new AppError('Você não pode desativar a própria conta.', 422, 'CANNOT_DEACTIVATE_SELF');
    }

    if (dto.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundError(`Departamento com ID '${dto.departmentId}' não foi encontrado.`);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: USER_INCLUDE,
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE_USER',
        entity: 'User',
        entityId: id,
        oldValues: JSON.stringify({ name: existing.name, position: existing.position, departmentId: existing.department?.id ?? null, status: existing.status }),
        newValues: JSON.stringify({ name: updated.name, position: updated.position, departmentId: updated.department?.id ?? null, status: updated.status }),
      },
    });

    return toPublicShape(updated);
  }

  /**
   * Concede ou revoga acesso administrativo — substitui o conjunto de papéis
   * do usuário pelo informado. Protegida contra dois cenários de auto-exclusão:
   * remover o próprio acesso de ADMIN_MASTER, e remover o último ADMIN_MASTER
   * do sistema (o que deixaria a plataforma sem governança).
   */
  public static async setRoles(id: string, dto: SetUserRolesDTO, adminId: string) {
    const existing = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!existing) throw new NotFoundError(`Usuário com ID '${id}' não foi encontrado.`);

    const currentRoleNames = existing.userRoles.map((ur) => ur.role.name);
    const isRemovingAdminMaster = currentRoleNames.includes('ADMIN_MASTER') && !dto.roles.includes('ADMIN_MASTER');

    if (isRemovingAdminMaster) {
      if (id === adminId) {
        throw new AppError('Você não pode remover o próprio acesso de ADMIN_MASTER.', 422, 'CANNOT_SELF_DEMOTE');
      }
      const adminMasterCount = await prisma.userRole.count({ where: { role: { name: 'ADMIN_MASTER' } } });
      if (adminMasterCount <= 1) {
        throw new AppError(
          'Não é possível remover o último ADMIN_MASTER do sistema — isso deixaria a plataforma sem governança.',
          422,
          'LAST_ADMIN_MASTER',
        );
      }
    }

    const roles = await prisma.role.findMany({ where: { name: { in: dto.roles } } });
    if (roles.length !== dto.roles.length) {
      throw new AppError('Um ou mais perfis informados são inválidos.', 422, 'INVALID_ROLE');
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: 'UPDATE_USER_ROLES',
          entity: 'User',
          entityId: id,
          oldValues: JSON.stringify({ roles: currentRoleNames }),
          newValues: JSON.stringify({ roles: dto.roles }),
        },
      });
    });

    const updated = await prisma.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE });
    return toPublicShape(updated);
  }
}
