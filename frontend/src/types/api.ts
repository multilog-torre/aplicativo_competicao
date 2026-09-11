export interface User {
  id: string;
  corporateId: string | null;
  email: string;
  name: string;
  position: string | null;
  avatarType: string;
  avatarUrl: string | null;
  totalPoints: number;
  department: { id: string; name: string } | null;
  level: { id: string; number?: number; levelNumber?: number; name: string; badgeIcon: string } | null;
  roles: string[];
  permissions: string[];
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  status: string;
  usersCount?: number;
}

export interface AvatarPreset {
  id: string;
  label: string;
  icon: string;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
  OTHER: 'Outro',
  UNDISCLOSED: 'Prefiro não informar',
};

export interface ProfileData {
  id: string;
  name: string;
  position: string | null;
  department: { id: string; name: string } | null;
  avatarType: string;
  avatarUrl: string | null;
  totalPoints: number;
  ranking: { position: number | null };
  level: { id: string; levelNumber: number; name: string; badgeIcon: string; minPoints: number } | null;
  nextLevel: { id: string; name: string; minPoints: number; pointsNeeded: number } | null;
  achievementsCount: number;
  achievements?: Array<{ id: string; unlockedAt: string; achievement: { id: string; name: string; description: string; icon: string; pointsReward: number } }>;
  recentActivities?: UserActivity[];
  // Só presentes no perfil PRÓPRIO — nunca no perfil público de outro colega.
  birthDate?: string | null;
  gender?: Gender | null;
}

export interface ActivityType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string;
  rulesDescription: string | null;
  scoringType: string;
  basePoints: number;
  unit: string | null;
  multiplier: number;
  dailyLimit: number | null;
  weeklyLimit: number | null;
  monthlyLimit: number | null;
  requiresEvidence: boolean;
  allowedFileTypes: string;
  status: string;
  activitiesCount?: number;
}

export interface PointsTransaction {
  id: string;
  points: number;
  transactionType: string;
  description: string;
  createdAt: string;
  user?: { id: string; name: string };
  creator?: { id: string; name: string } | null;
}

export interface UserActivity {
  id: string;
  activityType?: { id: string; name: string; icon: string; unit: string | null };
  activityTypeName?: string;
  icon?: string;
  quantity: number;
  unit: string | null;
  calculatedPoints: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  activityDate: string;
  createdAt: string;
  rejectionReason?: string | null;
}

export interface EvidenceItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  downloadUrl: string;
}

export interface ActivityDetail {
  id: string;
  quantity: number;
  unit: string | null;
  description: string | null;
  calculatedPoints: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  activityDate: string;
  createdAt: string;
  rejectionReason: string | null;
  user: { id: string; name: string; email: string };
  activityType: {
    id: string;
    name: string;
    icon: string;
    description: string | null;
    rulesDescription: string | null;
    unit: string | null;
    requiresEvidence: boolean;
  };
  evidences: EvidenceItem[];
}

export interface RankingEntry {
  position: number;
  userId: string;
  name: string;
  avatarType: string;
  avatarUrl: string | null;
  department: { id: string; name: string } | null;
  points: number;
  totalPointsAllTime: number;
}

export interface DashboardData {
  points: { total: number };
  ranking: { position: number | null; totalParticipants: number };
  level: {
    current: { id: string; levelNumber: number; name: string; badgeIcon: string; minPoints: number } | null;
    next: { id: string; name: string; minPoints: number; pointsNeeded: number } | null;
    progress: { current: number; target: number | null };
  };
  recentActivities: UserActivity[];
  charts: {
    pointsEvolution: Array<{ date: string; cumulativePoints: number }>;
    activitiesByModality: Array<{ activityTypeName: string; icon: string; count: number; totalPoints: number }>;
    rankingEvolution: null;
    rankingEvolutionNote?: string;
    performanceByPeriod: Array<{ weekStart: string; points: number }>;
  };
  motivationalMessage: string;
}

export interface Post {
  id: string;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null };
  content: string;
  hasImage: boolean;
  imageDownloadUrl: string | null;
  status: string;
  likesCount: number;
  commentsCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null };
}

export interface AdminUser {
  id: string;
  corporateId: string | null;
  name: string;
  email: string;
  position: string | null;
  birthDate: string | null;
  gender: Gender | null;
  status: string;
  totalPoints: number;
  department: { id: string; name: string } | null;
  roles: string[];
  createdAt: string;
}

export interface RoleCatalogItem {
  id: string;
  name: string;
  description: string | null;
}

export interface AdminDashboardData {
  indicators: {
    totalUsers: number;
    activeUsers: number;
    activities: { total: number; pending: number; approved: number; rejected: number; cancelled: number };
    pendingRedemptions: number;
    points: { totalDistributed: number; netCirculating: number };
    topModality: { activityTypeId: string; name: string; icon: string; approvedCount: number } | null;
    challenges: { total: number; active: number; completedParticipations: number };
    rewardsCatalogCount: number;
    totalRedemptions: number;
  };
  // Baseado em RankingService.getGeneralLeaderboard() — traz id/name/points/avatar
  // (sem departamento, que só existe no /ranking completo, Fase 10).
  topRanking: Array<{ position: number; id: string; name: string; points: number; avatarType: string; avatarUrl: string | null }>;
  charts: {
    activitiesOverTime: Array<{ date: string; approvedCount: number }>;
    pointsDistributedOverTime: Array<{ date: string; points: number }>;
    activitiesByModality: Array<{ activityTypeId: string; name: string; icon: string; approvedCount: number }>;
    usersByDepartment: Array<{ departmentId: string; departmentName: string; count: number }>;
    redemptionsByStatus: Array<{ status: string; count: number }>;
  };
}

export interface Level {
  id: string;
  levelNumber: number;
  name: string;
  minPoints: number;
  badgeIcon: string;
  description: string | null;
}

export interface CyclePrize {
  id: string;
  position: 1 | 2 | 3;
  title: string;
  description: string | null;
}

export interface CycleWinner {
  id: string;
  position: 1 | 2 | 3;
  pointsAtClose: number;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null };
}

export type CycleEffectiveStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CLOSED' | 'CANCELLED';

export interface AwardCycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  effectiveStatus: CycleEffectiveStatus;
  closedAt: string | null;
  prizes: CyclePrize[];
  winners: CycleWinner[];
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
