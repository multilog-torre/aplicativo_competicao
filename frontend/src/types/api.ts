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

export type AchievementLevel = 'BRONZE' | 'PRATA' | 'OURO';
export type AchievementIconType = 'EMOJI' | 'UPLOAD';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconType: AchievementIconType;
  category: string;
  level: AchievementLevel;
  pointsReward: number;
  ruleType: string;
  ruleValue: Record<string, unknown>;
  activityTypeId: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  unlockedCount?: number;
}

export interface AchievementProgress {
  current: number;
  target: number;
  percent: number;
  lowerIsBetter: boolean;
}

export interface AchievementWithProgress extends Achievement {
  unlocked: boolean;
  unlockedAt: string | null;
  progress: AchievementProgress | null;
}

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
  birthDate?: string | null;
  age?: number | null;
  gender?: Gender | null;
  createdAt?: string;
}

/** Item da seção "Participantes" — lista de todos os competidores. */
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
  description?: string | null;
  evidences?: Array<{ id: string; fileType: string; downloadUrl: string }>;
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
  filtersApplied: { dateFrom: string | null; dateTo: string | null };
  charts: {
    pointsHistory: PointsHistorySeries;
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
  eventId: string | null;
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

export interface PointsHistorySeries {
  day: Array<{ date: string; label: string; points: number }>;
  month: Array<{ date: string; label: string; points: number }>;
  year: Array<{ date: string; label: string; points: number }>;
}

export interface UserEvolutionSeries {
  userId: string;
  name: string;
  series: Array<{ date: string; label: string; points: number }>;
}

export interface AdminDashboardFiltersDTO {
  dateFrom?: string;
  dateTo?: string;
  cycleId?: string;
  userId?: string;
  departmentId?: string;
  activityTypeId?: string;
}

export interface AdminDashboardData {
  indicators: {
    totalUsers: number;
    activeUsers: number;
    activities: { total: number; pending: number; approved: number; rejected: number; cancelled: number; approvedToday: number };
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
  filtersApplied: { dateFrom: string | null; dateTo: string | null; userId: string | null; departmentId: string | null; activityTypeId: string | null };
  charts: {
    activitiesOverTime: Array<{ date: string; approvedCount: number }>;
    pointsHistory: PointsHistorySeries;
    activitiesByModality: Array<{ activityTypeId: string; name: string; icon: string; approvedCount: number }>;
    topActivities: Array<{ activityTypeId: string; name: string; icon: string; approvedCount: number }>;
    topUsersEvolution: { day: UserEvolutionSeries[]; month: UserEvolutionSeries[]; year: UserEvolutionSeries[] };
    usersByDepartment: Array<{ departmentId: string; departmentName: string; count: number }>;
    redemptionsByStatus: Array<{ status: string; count: number }>;
    modalityHighlights: Array<{ activityTypeId: string; modalityName: string; icon: string; userId: string; userName: string; points: number }>;
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

export type EventCategory = 'CORRIDA' | 'CAMINHADA' | 'CICLISMO' | 'ACADEMIA' | 'ESPORTE_COLETIVO' | 'OUTRO';
export type EventStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
export type EventParticipantStatus = 'REGISTERED' | 'ATTENDED' | 'NO_SHOW';

export interface CommunityEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  eventDate: string;
  location: string | null;
  bonusPoints: number | null;
  status: EventStatus;
  rejectionReason: string | null;
  createdBy: { id: string; name: string; avatarType: string; avatarUrl: string | null };
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  completedAt: string | null;
  participantsCount: number;
  isPast: boolean;
  canJoin: boolean;
  myParticipationStatus: EventParticipantStatus | null;
  createdAt: string;
}

export interface EventParticipantEntry {
  id: string;
  status: EventParticipantStatus;
  registeredAt: string;
  user: { id: string; name: string; avatarType: string; avatarUrl: string | null; department: { name: string } | null };
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  referenceId: string | null;
  createdAt: string;
}
