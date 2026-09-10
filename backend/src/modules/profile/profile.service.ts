import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../shared/errors/AppError';
import { UploadedFile } from '../../shared/types/upload';
import { assertAllowedFile } from '../../shared/utils/fileValidation';
import { AchievementService } from '../achievements/achievement.service';
import { RankingService } from '../ranking/ranking.service';
import { getStorageProvider } from '../storage/storage.factory';
import { ChangePasswordDTO, UpdateProfileDTO } from './profile.dto';

const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png'];

/**
 * Catálogo fixo de avatares pré-definidos. Segue o mesmo padrão já usado em
 * todo o projeto (ícone como string, renderizado pelo frontend — ex.:
 * activityType.icon, level.badgeIcon, achievement.icon) — não são arquivos
 * de imagem reais, então não exigem nenhum storage.
 */
const AVATAR_PRESETS = [
  { id: 'fox', label: 'Raposa', icon: 'fox' },
  { id: 'owl', label: 'Coruja', icon: 'bird' },
  { id: 'astronaut', label: 'Astronauta', icon: 'rocket' },
  { id: 'runner', label: 'Corredor', icon: 'footprints' },
  { id: 'cyclist', label: 'Ciclista', icon: 'bike' },
  { id: 'reader', label: 'Leitor', icon: 'book-open' },
  { id: 'zen', label: 'Zen', icon: 'flower' },
  { id: 'champion', label: 'Campeão', icon: 'trophy' },
] as const;

export class ProfileService {
  public static listAvatarPresets() {
    return AVATAR_PRESETS;
  }

  /** Perfil completo do próprio usuário — todos os dados, sem restrição. */
  public static async getOwnProfile(userId: string) {
    return this.buildProfile(userId, true);
  }

  /**
   * Perfil "público" de outro usuário, dentro da corporação: dados já
   * visíveis via /ranking (nome, avatar, departamento, pontos, nível) mais
   * uma contagem de conquistas — sem listar quais, e sem histórico de
   * atividades, respeitando a mesma restrição de privacidade da Fase 12
   * (achievements/users/:userId é self-ou-admin) e das Fases 6/7 (atividades
   * são privadas ao dono).
   */
  public static async getPublicProfile(userId: string, requestingUserId: string, isAdmin: boolean) {
    const isSelfOrAdmin = userId === requestingUserId || isAdmin;
    return this.buildProfile(userId, isSelfOrAdmin);
  }

  private static async buildProfile(userId: string, includePrivateDetails: boolean) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: true, level: true },
    });
    if (!user) throw new NotFoundError(`Usuário com ID '${userId}' não foi encontrado.`);

    const [position, nextLevel, achievementsCount] = await Promise.all([
      RankingService.getGeneralPosition(userId),
      prisma.level.findFirst({ where: { minPoints: { gt: user.totalPoints } }, orderBy: { minPoints: 'asc' } }),
      prisma.userAchievement.count({ where: { userId } }),
    ]);

    const base = {
      id: user.id,
      name: user.name,
      position: user.position,
      department: user.department ? { id: user.department.id, name: user.department.name } : null,
      avatarType: user.avatarType,
      avatarUrl: user.avatarType === 'UPLOAD' ? (user.avatarUrl ? `/api/v1/profile/${user.id}/avatar` : null) : user.avatarUrl,
      totalPoints: user.totalPoints,
      ranking: { position },
      level: user.level
        ? { id: user.level.id, levelNumber: user.level.levelNumber, name: user.level.name, badgeIcon: user.level.badgeIcon, minPoints: user.level.minPoints }
        : null,
      nextLevel: nextLevel
        ? { id: nextLevel.id, name: nextLevel.name, minPoints: nextLevel.minPoints, pointsNeeded: nextLevel.minPoints - user.totalPoints }
        : null,
      achievementsCount,
      createdAt: user.createdAt,
    };

    if (!includePrivateDetails) {
      return base;
    }

    const [achievements, recentActivities] = await Promise.all([
      AchievementService.listUnlockedForUser(userId, userId, false),
      prisma.userActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { activityType: { select: { name: true, icon: true } } },
      }),
    ]);

    return {
      ...base,
      achievements,
      recentActivities: recentActivities.map((a) => ({
        id: a.id,
        activityTypeName: a.activityType.name,
        icon: a.activityType.icon,
        quantity: a.quantity,
        unit: a.unit,
        calculatedPoints: a.calculatedPoints,
        status: a.status,
        activityDate: a.activityDate,
      })),
    };
  }

  // ─── Autoedição de dados básicos (nome, cargo, departamento) ─────────────────

  /**
   * Permite que o próprio usuário mantenha nome, cargo e departamento
   * atualizados. Toda alteração é auditada (oldValues/newValues) para
   * preservar rastreabilidade, já que são dados de identidade corporativa.
   */
  public static async updateOwnProfile(userId: string, dto: UpdateProfileDTO) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError(`Usuário com ID '${userId}' não foi encontrado.`);

    if (dto.departmentId) {
      const department = await prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw new NotFoundError(`Departamento com ID '${dto.departmentId}' não foi encontrado.`);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
      },
      include: { department: true },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE_PROFILE',
        entity: 'User',
        entityId: userId,
        oldValues: JSON.stringify({ name: existing.name, position: existing.position, departmentId: existing.departmentId }),
        newValues: JSON.stringify({ name: updated.name, position: updated.position, departmentId: updated.departmentId }),
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      position: updated.position,
      department: updated.department ? { id: updated.department.id, name: updated.department.name } : null,
    };
  }

  /**
   * Troca de senha pelo próprio usuário — exige a senha atual (evita que
   * alguém que sequestre uma sessão já aberta troque a senha sem saber a
   * original). Nunca registra o valor da senha na auditoria, só o evento.
   */
  public static async changePassword(userId: string, dto: ChangePasswordDTO) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new NotFoundError(`Usuário com ID '${userId}' não foi encontrado.`);

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new AppError('A senha atual informada está incorreta.', 422, 'INVALID_CURRENT_PASSWORD');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CHANGE_PASSWORD',
        entity: 'User',
        entityId: userId,
        newValues: JSON.stringify({ changedAt: new Date() }),
      },
    });

    return { message: 'Senha alterada com sucesso.' };
  }

  // ─── Avatar ────────────────────────────────────────────────────────────────────

  public static async setAvatar(userId: string, avatarType: string, presetId: string | undefined, file: UploadedFile | undefined) {
    let avatarUrl: string | null = null;

    if (avatarType === 'PRESET') {
      const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
      if (!preset) {
        throw new AppError(
          `Avatar pré-definido inválido. Opções válidas: ${AVATAR_PRESETS.map((p) => p.id).join(', ')}.`,
          422,
          'INVALID_PRESET',
        );
      }
      avatarUrl = preset.icon;
    } else if (avatarType === 'UPLOAD') {
      if (!file) {
        throw new AppError('Nenhum arquivo foi enviado. Utilize o campo "file".', 422, 'FILE_REQUIRED');
      }
      assertAllowedFile(file, ALLOWED_AVATAR_EXTENSIONS);
      const storage = getStorageProvider();
      const { storagePath } = await storage.save({
        buffer: file.buffer,
        originalName: file.originalname,
        mimeType: file.mimetype,
        folder: `avatars/${userId}`,
      });
      avatarUrl = storagePath;
    }
    // avatarType === 'INITIALS' → avatarUrl permanece null (gerado a partir do nome no frontend).

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarType, avatarUrl },
      select: { id: true, avatarType: true, avatarUrl: true },
    });

    return {
      avatarType: updated.avatarType,
      avatarUrl: updated.avatarType === 'UPLOAD' ? (updated.avatarUrl ? `/api/v1/profile/${userId}/avatar` : null) : updated.avatarUrl,
    };
  }

  /** Foto de avatar enviada (avatarType='UPLOAD') — pública para qualquer autenticado, mesmo padrão de nome/avatar já exposto no ranking/mural. */
  public static async getAvatarForDownload(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarType: true, avatarUrl: true } });
    if (!user || user.avatarType !== 'UPLOAD' || !user.avatarUrl) {
      throw new NotFoundError('Este usuário não possui uma foto de avatar enviada.');
    }

    const storage = getStorageProvider();
    const buffer = await storage.read(user.avatarUrl);
    return { buffer };
  }
}
