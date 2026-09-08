import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { ListDepartmentsQueryDTO } from './department.dto';

export class DepartmentService {
  /**
   * Catálogo de departamentos — leitura pública, usada por telas de perfil
   * e formulários de cadastro para permitir a seleção. Por padrão mostra
   * apenas ACTIVE (mesmo padrão de /activity-types, /levels, etc.).
   */
  public static async list(query: ListDepartmentsQueryDTO) {
    return prisma.department.findMany({
      where: { status: query.status ?? 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  }

  public static async getById(id: string) {
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) throw new NotFoundError(`Departamento com ID '${id}' não foi encontrado.`);
    return department;
  }
}
