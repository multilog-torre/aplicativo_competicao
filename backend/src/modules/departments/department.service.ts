import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { CreateDepartmentDTO, ListDepartmentsQueryDTO, UpdateDepartmentDTO } from './department.dto';

export class DepartmentService {
  /**
   * Catálogo de departamentos — leitura pública, usada por telas de perfil
   * e formulários de cadastro para permitir a seleção. Por padrão mostra
   * apenas ACTIVE (mesmo padrão de /activity-types, /levels, etc.).
   */
  public static async list(query: ListDepartmentsQueryDTO) {
    const status = query.status ?? 'ACTIVE';
    const departments = await prisma.department.findMany({
      where: status === 'ALL' ? {} : { status },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      status: d.status,
      usersCount: d._count.users,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  }

  public static async getById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!department) throw new NotFoundError(`Departamento com ID '${id}' não foi encontrado.`);
    return {
      id: department.id,
      name: department.name,
      description: department.description,
      status: department.status,
      usersCount: department._count.users,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
    };
  }

  public static async create(data: CreateDepartmentDTO, adminId: string) {
    const existing = await prisma.department.findFirst({ where: { name: { equals: data.name } } });
    if (existing) {
      throw new AppError(`Já existe um departamento cadastrado com o nome '${data.name}'.`, 409, 'CONFLICT');
    }

    const created = await prisma.department.create({
      data: { name: data.name, description: data.description, status: data.status },
    });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'CREATE',
        entity: 'Department',
        entityId: created.id,
        newValues: JSON.stringify(created),
      },
    });

    return created;
  }

  public static async update(id: string, data: UpdateDepartmentDTO, adminId: string) {
    const existing = await prisma.department.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Departamento com ID '${id}' não foi encontrado.`);
    }

    if (data.name && data.name !== existing.name) {
      const nameConflict = await prisma.department.findFirst({ where: { name: { equals: data.name }, id: { not: id } } });
      if (nameConflict) {
        throw new AppError(`Já existe outro departamento com o nome '${data.name}'.`, 409, 'CONFLICT');
      }
    }

    const updated = await prisma.department.update({ where: { id }, data });

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'UPDATE',
        entity: 'Department',
        entityId: updated.id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify(updated),
      },
    });

    return updated;
  }

  public static async delete(id: string, adminId: string) {
    const existing = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!existing) {
      throw new NotFoundError(`Departamento com ID '${id}' não foi encontrado.`);
    }

    const hasUsers = existing._count.users > 0;

    let resultStatus = 'INACTIVE';
    if (hasUsers) {
      // Soft delete para preservar o vínculo histórico dos colaboradores já cadastrados nele
      await prisma.department.update({ where: { id }, data: { status: 'INACTIVE' } });
      resultStatus = 'DEACTIVATED';
    } else {
      // Exclusão definitiva se não houver ninguém vinculado
      await prisma.department.delete({ where: { id } });
      resultStatus = 'DELETED';
    }

    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: resultStatus === 'DELETED' ? 'DELETE' : 'DEACTIVATE',
        entity: 'Department',
        entityId: id,
        oldValues: JSON.stringify(existing),
        newValues: JSON.stringify({ status: resultStatus }),
      },
    });

    return {
      message:
        resultStatus === 'DELETED'
          ? 'Departamento excluído com sucesso.'
          : 'Departamento desativado com sucesso para preservar o histórico dos colaboradores vinculados a ele.',
      status: resultStatus,
    };
  }
}
