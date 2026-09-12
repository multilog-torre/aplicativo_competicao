import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { ListParticipantsQueryDTO } from './participant.dto';

export interface ParticipantEntry {
  id: string;
  name: string;
  position: string | null;
  avatarType: string;
  avatarUrl: string | null;
  department: { id: string; name: string } | null;
  totalPoints: number;
  level: { id: string; levelNumber: number; name: string; badgeIcon: string } | null;
  achievementsCount: number;
}

export class ParticipantService {
  /**
   * Seção "Participantes": todo mundo que compete (usuários ACTIVE),
   * ordenado alfabeticamente, com busca por nome/cargo e filtro por
   * departamento — pensada pra navegação/consulta, diferente do /ranking
   * (que ordena por pontuação e serve pra disputa).
   */
  public static async list(query: ListParticipantsQueryDTO) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    if (query.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: query.departmentId } });
      if (!department) {
        throw new NotFoundError(`Departamento com ID '${query.departmentId}' não foi encontrado.`);
      }
    }

    const where = {
      status: 'ACTIVE' as const,
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { position: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          position: true,
          avatarType: true,
          avatarUrl: true,
          totalPoints: true,
          department: { select: { id: true, name: true } },
          level: { select: { id: true, levelNumber: true, name: true, badgeIcon: true } },
          _count: { select: { userAchievements: true } },
        },
      }),
    ]);

    const entries: ParticipantEntry[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      position: u.position,
      avatarType: u.avatarType,
      avatarUrl: u.avatarType === 'UPLOAD' ? (u.avatarUrl ? `/api/v1/profile/${u.id}/avatar` : null) : u.avatarUrl,
      department: u.department,
      totalPoints: u.totalPoints,
      level: u.level,
      achievementsCount: u._count.userAchievements,
    }));

    return {
      entries,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
