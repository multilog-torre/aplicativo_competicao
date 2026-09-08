import { Router } from 'express';
import { activityRoutes } from '../modules/activities/activity.routes';
import { activityTypeRoutes } from '../modules/activity-types/activity-type.routes';
import { achievementRoutes } from '../modules/achievements/achievement.routes';
import { adminActivityRoutes } from '../modules/admin/admin-activity.routes';
import { adminDashboardRoutes } from '../modules/admin/admin-dashboard.routes';
import { auditLogRoutes } from '../modules/admin/audit-log.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { challengeRoutes } from '../modules/challenges/challenge.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { departmentRoutes } from '../modules/departments/department.routes';
import { gameRuleRoutes } from '../modules/game-rules/game-rule.routes';
import { healthRoutes } from '../modules/health/health.routes';
import { levelRoutes } from '../modules/levels/level.routes';
import { notificationRoutes } from '../modules/notifications/notification.routes';
import { postRoutes } from '../modules/posts/post.routes';
import { profileRoutes } from '../modules/profile/profile.routes';
import { rankingRoutes } from '../modules/ranking/ranking.routes';
import { rewardRoutes } from '../modules/rewards/reward.routes';
import { scoringRoutes } from '../modules/scoring/scoring.routes';

const router = Router();

// Rotas de Sistema e Healthcheck
router.use('/', healthRoutes);

// Rotas de Autenticação e Autorização (RBAC)
router.use('/auth', authRoutes);

// Rotas de Gestão de Modalidades
router.use('/activity-types', activityTypeRoutes);

// Rotas do Motor de Pontuação e Ledger de Transações
router.use('/scoring', scoringRoutes);

// Rotas de Registro de Atividades (Fase 6)
router.use('/activities', activityRoutes);

// Rotas de Validação Administrativa — Aprovação/Rejeição (Fase 8)
router.use('/admin/activities', adminActivityRoutes);

// Rotas de Auditoria — consulta da trilha de rastreabilidade (Fase 9)
router.use('/admin/audit-logs', auditLogRoutes);

// Rota do Painel Administrativo (Fase 20)
router.use('/admin/dashboard', adminDashboardRoutes);

// Rotas de Ranking Dinâmico (Fase 10)
router.use('/ranking', rankingRoutes);

// Rotas de Níveis de Progressão (Fase 11)
router.use('/levels', levelRoutes);

// Rotas de Conquistas (Fase 12)
router.use('/achievements', achievementRoutes);

// Rotas de Desafios (Fase 13)
router.use('/challenges', challengeRoutes);

// Rotas de Premiações (Fase 14)
router.use('/rewards', rewardRoutes);

// Rotas do Mural Social (Fase 15)
router.use('/posts', postRoutes);

// Rotas de Notificações (Fase 16)
router.use('/notifications', notificationRoutes);

// Rota do Dashboard do Participante (Fase 17)
router.use('/dashboard', dashboardRoutes);

// Rotas de Departamentos (catálogo público, usado no formulário de perfil)
router.use('/departments', departmentRoutes);

// Rotas de Regras do Jogo — "Como funciona?" (Fase 21)
router.use('/game-rules', gameRuleRoutes);

// Rotas de Perfil e Avatar (Fase 18)
router.use('/profile', profileRoutes);

export { router as apiRouter };
