import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando Seed do Banco de Dados...');

  // 1. Roles
  const roleAdminMaster = await prisma.role.upsert({
    where: { name: 'ADMIN_MASTER' },
    update: {},
    create: {
      name: 'ADMIN_MASTER',
      description: 'Acesso irrestrito a todas as configurações, auditoria e gestão da plataforma',
    },
  });

  const roleAdmin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'Validação de atividades, gestão de desafios e moderação',
    },
  });

  const roleParticipante = await prisma.role.upsert({
    where: { name: 'PARTICIPANTE' },
    update: {},
    create: {
      name: 'PARTICIPANTE',
      description: 'Acesso regular para registro de atividades, mural e acompanhamento de ranking',
    },
  });

  console.log('✅ Roles criadas:', [roleAdminMaster.name, roleAdmin.name, roleParticipante.name]);

  // 2. Permissões
  const permissions = [
    { name: 'activities:create', description: 'Registrar nova atividade' },
    { name: 'activities:read', description: 'Visualizar atividades' },
    { name: 'activities:approve', description: 'Aprovar ou rejeitar atividades' },
    { name: 'modalities:manage', description: 'Criar e editar modalidades' },
    { name: 'points:adjust', description: 'Realizar ajustes manuais de pontuação' },
    { name: 'challenges:manage', description: 'Criar e gerenciar desafios' },
    { name: 'rewards:manage', description: 'Cadastrar e gerenciar recompensas' },
    { name: 'audit:read', description: 'Visualizar trilha de auditoria' },
    { name: 'users:manage', description: 'Gerenciar usuários e permissões' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }

  // 3. Departamentos
  const departments = [
    { name: 'Tecnologia da Informação', description: 'Engenharia, Infraestrutura e Suporte' },
    { name: 'Vendas e Comercial', description: 'Operações comerciais e Novos Negócios' },
    { name: 'Recursos Humanos', description: 'Pessoas e Cultura' },
    { name: 'Marketing', description: 'Branding, Mídia e Comunicação' },
    { name: 'Operações e Logística', description: 'Planejamento e Execução Operacional' },
    { name: 'Financeiro', description: 'Controladoria e Finanças' },
  ];

  const createdDepts: Record<string, string> = {};
  for (const dept of departments) {
    const d = await prisma.department.upsert({
      where: { name: dept.name },
      update: {},
      create: dept,
    });
    createdDepts[d.name] = d.id;
  }
  console.log('✅ Departamentos criados:', Object.keys(createdDepts).length);

  // 4. Níveis de Gamificação
  const levels = [
    { levelNumber: 1, name: 'Iniciante', minPoints: 0, badgeIcon: 'compass', description: 'Primeiros passos na competição' },
    { levelNumber: 2, name: 'Explorador', minPoints: 500, badgeIcon: 'map-pin', description: 'Consistência inicial demonstrada' },
    { levelNumber: 3, name: 'Competidor', minPoints: 1000, badgeIcon: 'flame', description: 'Presença constante nos rankings' },
    { levelNumber: 4, name: 'Destaque', minPoints: 2500, badgeIcon: 'star', description: 'Inspiração e alto engajamento' },
    { levelNumber: 5, name: 'Campeão', minPoints: 5000, badgeIcon: 'crown', description: 'Elite máxima da corporação' },
  ];

  const createdLevels: Record<number, string> = {};
  for (const lvl of levels) {
    const l = await prisma.level.upsert({
      where: { levelNumber: lvl.levelNumber },
      update: { name: lvl.name, minPoints: lvl.minPoints, badgeIcon: lvl.badgeIcon },
      create: lvl,
    });
    createdLevels[lvl.levelNumber] = l.id;
  }
  console.log('✅ Níveis de progressão criados');

  // 5. Modalidades de Atividades
  const modalities = [
    {
      name: 'Academia & Musculação',
      category: 'SPORTS',
      icon: 'dumbbell',
      description: 'Treino de musculação ou funcional',
      rulesDescription: '1 sessão de treino no dia com duração mínima de 40 min',
      scoringType: 'FIXED',
      basePoints: 20,
      unit: 'treino',
      dailyLimit: 1,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png',
    },
    {
      name: 'Corrida de Rua / Esteira',
      category: 'SPORTS',
      icon: 'run',
      description: 'Corrida ao ar livre ou em esteira',
      rulesDescription: '10 pontos para cada 1 km percorrido (comprovado via app Strava/Garmin/Smartwatch)',
      scoringType: 'QUANTITY',
      basePoints: 10,
      unit: 'km',
      multiplier: 10.0,
      dailyLimit: 30,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png,pdf',
    },
    {
      name: 'Caminhada',
      category: 'SPORTS',
      icon: 'footprints',
      description: 'Caminhada contínua',
      rulesDescription: '5 pontos para cada 1 km percorrido',
      scoringType: 'QUANTITY',
      basePoints: 5,
      unit: 'km',
      multiplier: 5.0,
      dailyLimit: 20,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png',
    },
    {
      name: 'Ciclismo',
      category: 'SPORTS',
      icon: 'bike',
      description: 'Pedal urbano, estrada ou spinning',
      rulesDescription: '5 pontos para cada 1 km pedalado',
      scoringType: 'QUANTITY',
      basePoints: 5,
      unit: 'km',
      multiplier: 5.0,
      dailyLimit: 80,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png',
    },
    {
      name: 'Leitura de Livros',
      category: 'EDUCATION',
      icon: 'book-open',
      description: 'Leitura de livros técnicos, ficção ou desenvolvimento pessoal',
      rulesDescription: '30 pontos por livro concluído ou resumo entregue',
      scoringType: 'FIXED',
      basePoints: 30,
      unit: 'livro',
      dailyLimit: 1,
      requiresEvidence: true,
      allowedFileTypes: 'jpg,jpeg,png,pdf,txt',
    },
    {
      name: 'Meditação & Mindfulness',
      category: 'HEALTH',
      icon: 'heart-pulse',
      description: 'Prática de atenção plena ou meditação guiada',
      rulesDescription: '15 pontos por sessão de no mínimo 15 minutos',
      scoringType: 'FIXED',
      basePoints: 15,
      unit: 'sessao',
      dailyLimit: 2,
      requiresEvidence: false,
    },
  ];

  const createdModalities: Array<Awaited<ReturnType<typeof prisma.activityType.upsert>>> = [];
  for (const mod of modalities) {
    const created = await prisma.activityType.upsert({
      where: { name: mod.name },
      update: mod,
      create: mod,
    });
    createdModalities.push(created);
  }
  console.log('✅ Modalidades criadas:', modalities.length);

  // 6. Conquistas (Achievements) — geradas automaticamente a partir das
  // modalidades REAIS já cadastradas acima (nunca hardcoded), garantindo pelo
  // menos ~20 no total mesmo que o número de modalidades mude no futuro.
  // planejamento: "Sistema de Conquistas com gestão admin e documentação
  // automática" — o admin pode editar/desativar qualquer uma normalmente
  // depois, porque isso é dado no banco, não configuração fixa de tela.
  type AchievementSeed = {
    name: string;
    description: string;
    icon: string;
    category: string;
    level: 'BRONZE' | 'PRATA' | 'OURO';
    pointsReward: number;
    ruleType: string;
    ruleValue: string;
    activityTypeId?: string;
  };

  const TIER_POINTS: Record<'BRONZE' | 'PRATA' | 'OURO', number> = { BRONZE: 30, PRATA: 80, OURO: 200 };
  const TIER_LABEL: Record<'BRONZE' | 'PRATA' | 'OURO', string> = { BRONZE: 'Iniciante', PRATA: 'Avançado', OURO: 'Mestre' };
  // Multiplicadores fixos pedidos: prata = 3x a meta bronze, ouro = 8x.
  const TIER_MULTIPLIER: Record<'BRONZE' | 'PRATA' | 'OURO', number> = { BRONZE: 1, PRATA: 3, OURO: 8 };

  /** 3 conquistas em níveis progressivos (bronze/prata/ouro) para UMA
   * modalidade — cumulativa (soma quantity, ex.: km) quando a modalidade
   * pontua por QUANTITY, ou por contagem de atividades quando pontua FIXED
   * (cada atividade já representa 1 ocorrência inteira, ex.: 1 treino). */
  function buildModalityAchievements(modality: (typeof createdModalities)[number]): AchievementSeed[] {
    const isCumulative = modality.scoringType === 'QUANTITY' && !!modality.unit;
    const baseTarget = isCumulative ? 10 : 5; // ex.: 10km ou 5 sessões na base (bronze)
    const unitLabel = modality.unit ?? 'atividades';

    return (['BRONZE', 'PRATA', 'OURO'] as const).map((level) => {
      const target = baseTarget * TIER_MULTIPLIER[level];
      const ruleType = isCumulative ? 'CUMULATIVE_QUANTITY' : 'SPECIFIC_MODALITY';
      const ruleValue = isCumulative
        ? { activityTypeId: modality.id, targetQuantity: target }
        : { activityTypeId: modality.id, count: target };
      const description = isCumulative
        ? `Acumulou ${target} ${unitLabel} em atividades aprovadas de ${modality.name}.`
        : `Completou ${target} atividades aprovadas de ${modality.name}.`;

      return {
        name: `${TIER_LABEL[level]} em ${modality.name}`,
        description,
        icon: modality.icon,
        category: modality.name.toUpperCase(),
        level,
        pointsReward: TIER_POINTS[level],
        ruleType,
        ruleValue: JSON.stringify(ruleValue),
        activityTypeId: modality.id,
      };
    });
  }

  const perModalityAchievements = createdModalities.flatMap(buildModalityAchievements);

  // Conquistas transversais — não ligadas a uma única modalidade (consistência,
  // ranking/pontuação, variedade e tempo de casa). "Milionário de Pontos" e
  // "Centena" completam a progressão bronze/ouro do TOTAL_POINTS ao redor do
  // "Clube dos 1.000" (prata) já existente, sem duplicar o mesmo limiar.
  const transversalAchievements: AchievementSeed[] = [
    {
      name: 'Sequência de Ferro',
      description: 'Registrou atividade aprovada em 7 dias consecutivos.',
      icon: 'flame',
      category: 'CONSISTENCIA',
      level: 'BRONZE',
      pointsReward: TIER_POINTS.BRONZE,
      ruleType: 'STREAK_DAYS',
      ruleValue: JSON.stringify({ days: 7 }),
    },
    {
      name: 'Disciplina Total',
      description: 'Registrou atividade aprovada em 30 dias consecutivos.',
      icon: 'flame',
      category: 'CONSISTENCIA',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'STREAK_DAYS',
      ruleValue: JSON.stringify({ days: 30 }),
    },
    {
      name: 'Centena',
      description: 'Acumulou 100 pontos no ledger oficial.',
      icon: 'gem',
      category: 'RANKING_PONTUACAO',
      level: 'BRONZE',
      pointsReward: TIER_POINTS.BRONZE,
      ruleType: 'TOTAL_POINTS',
      ruleValue: JSON.stringify({ minPoints: 100 }),
    },
    {
      name: 'Milionário de Pontos',
      description: 'Acumulou 5.000 pontos no ledger oficial.',
      icon: 'star',
      category: 'RANKING_PONTUACAO',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'TOTAL_POINTS',
      ruleValue: JSON.stringify({ minPoints: 5000 }),
    },
    {
      name: 'No Pódio',
      description: 'Alcançou o Top 3 do ranking geral.',
      icon: 'medal',
      category: 'RANKING_PONTUACAO',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'RANKING_POSITION',
      ruleValue: JSON.stringify({ maxPosition: 3 }),
    },
    {
      name: 'Líder Absoluto',
      description: 'Alcançou o 1º lugar do ranking geral.',
      icon: 'crown',
      category: 'RANKING_PONTUACAO',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'RANKING_POSITION',
      ruleValue: JSON.stringify({ maxPosition: 1 }),
    },
    {
      name: 'Multitarefa',
      description: 'Registrou atividade aprovada em 3 modalidades diferentes.',
      icon: 'compass',
      category: 'VARIEDADE',
      level: 'BRONZE',
      pointsReward: TIER_POINTS.BRONZE,
      ruleType: 'DISTINCT_MODALITIES',
      ruleValue: JSON.stringify({ count: 3 }),
    },
    {
      name: 'Explorador Completo',
      // Congela o número de modalidades ativas no momento do seed — se novas
      // modalidades forem cadastradas depois, esta meta não sobe sozinha (o
      // admin pode reeditá-la a qualquer momento pela tela de gestão).
      description: `Registrou atividade aprovada em todas as ${createdModalities.length} modalidades disponíveis.`,
      icon: 'sparkles',
      category: 'VARIEDADE',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'DISTINCT_MODALITIES',
      ruleValue: JSON.stringify({ count: createdModalities.length }),
    },
    {
      name: 'Veterano',
      description: 'Conta criada há pelo menos 90 dias.',
      icon: 'clock',
      category: 'TEMPO_DE_CASA',
      level: 'PRATA',
      pointsReward: TIER_POINTS.PRATA,
      ruleType: 'ACCOUNT_TENURE_DAYS',
      ruleValue: JSON.stringify({ days: 90 }),
    },
    {
      name: 'Aniversário de Participação',
      description: 'Conta criada há pelo menos 365 dias.',
      icon: 'cake',
      category: 'TEMPO_DE_CASA',
      level: 'OURO',
      pointsReward: TIER_POINTS.OURO,
      ruleType: 'ACCOUNT_TENURE_DAYS',
      ruleValue: JSON.stringify({ days: 365 }),
    },
  ];

  // As 3 conquistas "nomeadas" originais (mantidas por compatibilidade com
  // testes/histórico já existentes) + as geradas por modalidade + as
  // transversais — upsert por nome, então o admin pode ter editado/desativado
  // qualquer uma sem que um novo `npm run db:setup` a reviva com os valores
  // padrão (update aplica os valores do seed mesmo assim — mesmo
  // comportamento já usado por modalidades/níveis neste arquivo).
  const namedAchievements: AchievementSeed[] = [
    {
      name: 'Primeiro Passo',
      description: 'Registrou e teve sua primeira atividade aprovada na plataforma!',
      icon: 'award',
      category: 'CONSISTENCIA',
      level: 'BRONZE',
      pointsReward: 50,
      ruleType: 'ACTIVITY_COUNT',
      ruleValue: JSON.stringify({ count: 1 }),
    },
    {
      name: 'Hábito de Ferro',
      description: 'Completou 10 atividades aprovadas no sistema.',
      icon: 'shield-check',
      category: 'CONSISTENCIA',
      level: 'PRATA',
      pointsReward: 100,
      ruleType: 'ACTIVITY_COUNT',
      ruleValue: JSON.stringify({ count: 10 }),
    },
    {
      name: 'Clube dos 1.000',
      description: 'Alcançou a marca de 1.000 pontos acumulados no ledger oficial!',
      icon: 'trophy',
      category: 'RANKING_PONTUACAO',
      level: 'PRATA',
      pointsReward: 150,
      ruleType: 'TOTAL_POINTS',
      ruleValue: JSON.stringify({ minPoints: 1000 }),
    },
  ];

  const allAchievements = [...namedAchievements, ...perModalityAchievements, ...transversalAchievements];

  for (const ach of allAchievements) {
    await prisma.achievement.upsert({
      where: { name: ach.name },
      update: ach,
      create: ach,
    });
  }
  console.log(`✅ Conquistas criadas: ${allAchievements.length} (mínimo de 20 exigido)`);

  // 6.1 Regras do Jogo — "Como funciona?" (Fase 21, planejamento.md §22)
  const gameRuleSteps = [
    { stepNumber: 1, title: 'Escolha a modalidade', description: 'Veja as modalidades disponíveis e escolha qual atividade você vai realizar.', icon: 'list-checks' },
    { stepNumber: 2, title: 'Faça a atividade', description: 'Realize a atividade escolhida — academia, corrida, leitura ou qualquer outra modalidade configurada.', icon: 'activity' },
    { stepNumber: 3, title: 'Registre', description: 'Registre a atividade no sistema, informando data, quantidade e uma descrição.', icon: 'clipboard-list' },
    { stepNumber: 4, title: 'Envie evidência', description: 'Quando a modalidade exigir, envie uma foto ou comprovante da atividade realizada.', icon: 'upload' },
    { stepNumber: 5, title: 'Aguarde aprovação', description: 'Um administrador vai validar sua atividade e a evidência enviada.', icon: 'clock' },
    { stepNumber: 6, title: 'Receba pontos', description: 'Após a aprovação, os pontos são creditados automaticamente na sua conta.', icon: 'star' },
    { stepNumber: 7, title: 'Suba no ranking', description: 'Acompanhe sua posição no ranking geral, por modalidade ou por departamento.', icon: 'trending-up' },
    { stepNumber: 8, title: 'Conquiste premiações', description: 'Troque seus pontos acumulados por prêmios no catálogo de premiações.', icon: 'gift' },
  ];

  for (const step of gameRuleSteps) {
    await prisma.gameRuleStep.upsert({
      where: { stepNumber: step.stepNumber },
      update: step,
      create: step,
    });
  }
  console.log('✅ Regras do jogo ("Como funciona?") criadas');

  // 7. Catálogo de Premiações
  const rewards = [
    {
      title: 'Garrafa Térmica Premium 750ml',
      description: 'Garrafa térmica personalizada de alta durabilidade com isolamento a vácuo',
      pointsCost: 500,
      quantityAvailable: 30,
      status: 'AVAILABLE',
    },
    {
      title: 'Camiseta Dry-Fit Oficial',
      description: 'Camiseta de alta performance para treinos corporativos',
      pointsCost: 1000,
      quantityAvailable: 20,
      status: 'AVAILABLE',
    },
    {
      title: 'Fone de Ouvido Bluetooth Esportivo',
      description: 'Fone resistente ao suor com alta fidelidade sonora',
      pointsCost: 2500,
      quantityAvailable: 10,
      status: 'AVAILABLE',
    },
    {
      title: 'Day-off Especial Bonificado',
      description: '1 dia de folga remunerada alinhado com a liderança direta',
      pointsCost: 5000,
      quantityAvailable: 5,
      status: 'AVAILABLE',
    },
  ];

  for (const rew of rewards) {
    const existing = await prisma.reward.findFirst({ where: { title: rew.title } });
    if (!existing) {
      await prisma.reward.create({ data: rew });
    }
  }
  console.log('✅ Catálogo de recompensas criado');

  // 8. Usuários Iniciais
  const defaultPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('user123', 10);

  // 8.1 Admin Master
  const adminMaster = await prisma.user.upsert({
    where: { email: 'admin@empresa.com' },
    update: { levelId: createdLevels[1] },
    create: {
      corporateId: 'CORP-0001',
      email: 'admin@empresa.com',
      name: 'Administrador Master',
      passwordHash: defaultPassword,
      departmentId: createdDepts['Tecnologia da Informação'],
      position: 'Tech Lead / Administrador',
      avatarType: 'INITIALS',
      totalPoints: 0,
      levelId: createdLevels[1],
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminMaster.id, roleId: roleAdminMaster.id } },
    update: {},
    create: { userId: adminMaster.id, roleId: roleAdminMaster.id },
  });

  /**
   * REGRA DE OURO DO LEDGER (planejamento.md §8, §10 e §31):
   * users.total_points nunca pode ser gravado "solto". Todo saldo precisa ter
   * origem rastreável em points_transactions. Este helper cria a transação de
   * saldo inicial (idempotente) e recalcula o total a partir da soma do ledger.
   */
  async function ensureSeedBalance(userId: string, points: number, createdBy: string) {
    if (points > 0) {
      const existing = await prisma.pointsTransaction.findFirst({
        where: { userId, referenceType: 'SEED_BALANCE' },
      });

      if (!existing) {
        await prisma.pointsTransaction.create({
          data: {
            userId,
            points,
            transactionType: 'BONUS',
            description: 'Saldo inicial de migração do programa piloto de gamificação.',
            referenceType: 'SEED_BALANCE',
            referenceId: 'seed',
            createdBy,
          },
        });
      }
    }

    // Recalcula o agregado a partir da fonte oficial (o ledger)
    const ledger = await prisma.pointsTransaction.aggregate({
      where: { userId },
      _sum: { points: true },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { totalPoints: ledger._sum.points ?? 0 },
    });
  }

  // 8.2 Gestor / Admin
  const adminGestor = await prisma.user.upsert({
    where: { email: 'gestor@empresa.com' },
    update: { levelId: createdLevels[2] },
    create: {
      corporateId: 'CORP-0002',
      email: 'gestor@empresa.com',
      name: 'Gestor de Validação',
      passwordHash: defaultPassword,
      departmentId: createdDepts['Recursos Humanos'],
      position: 'Coordenador de Pessoas & Cultura',
      avatarType: 'INITIALS',
      totalPoints: 0,
      levelId: createdLevels[2],
    },
  });

  await ensureSeedBalance(adminGestor.id, 550, adminMaster.id);

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminGestor.id, roleId: roleAdmin.id } },
    update: {},
    create: { userId: adminGestor.id, roleId: roleAdmin.id },
  });

  // 8.3 Usuários Colaboradores de Teste
  const testUsers = [
    {
      corporateId: 'CORP-1001',
      email: 'renan@empresa.com',
      name: 'Renan Lima',
      department: 'Tecnologia da Informação',
      position: 'Engenheiro de Software',
      points: 200,
      level: 1,
    },
    {
      corporateId: 'CORP-1002',
      email: 'beatriz@empresa.com',
      name: 'Beatriz Santos',
      department: 'Marketing',
      position: 'Analista de Marketing Digital',
      points: 620,
      level: 2,
    },
    {
      corporateId: 'CORP-1003',
      email: 'carlos@empresa.com',
      name: 'Carlos Eduardo',
      department: 'Vendas e Comercial',
      position: 'Executivo de Contas',
      points: 1250,
      level: 3,
    },
  ];

  for (const u of testUsers) {
    const createdUser = await prisma.user.upsert({
      where: { email: u.email },
      update: { levelId: createdLevels[u.level] },
      create: {
        corporateId: u.corporateId,
        email: u.email,
        name: u.name,
        passwordHash: userPassword,
        departmentId: createdDepts[u.department],
        position: u.position,
        totalPoints: 0,
        levelId: createdLevels[u.level],
      },
    });

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: createdUser.id, roleId: roleParticipante.id } },
      update: {},
      create: { userId: createdUser.id, roleId: roleParticipante.id },
    });

    await ensureSeedBalance(createdUser.id, u.points, adminMaster.id);
  }

  console.log('✅ Saldos iniciais lançados no ledger (points_transactions)');

  console.log('✅ Usuários de teste criados com sucesso');
  console.log('🎉 Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
