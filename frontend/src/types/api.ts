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
}

export interface AvatarPreset {
  id: string;
  label: string;
  icon: string;
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

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
