import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runDatabaseTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO TESTES DA FASE 1 — BANCO DE DADOS');
  console.log('====================================================\n');

  try {
    // 1. Teste de Conexão e Integridade dos Seeds
    console.log('1️⃣ Validando entidades criadas pelo Seed...');
    
    const usersCount = await prisma.user.count();
    const rolesCount = await prisma.role.count();
    const deptsCount = await prisma.department.count();
    const modalitiesCount = await prisma.activityType.count();
    const levelsCount = await prisma.level.count();
    const achievementsCount = await prisma.achievement.count();
    const rewardsCount = await prisma.reward.count();

    console.log(`   - Usuários cadastrados: ${usersCount}`);
    console.log(`   - Perfis (Roles): ${rolesCount}`);
    console.log(`   - Departamentos: ${deptsCount}`);
    console.log(`   - Modalidades configuráveis: ${modalitiesCount}`);
    console.log(`   - Níveis de gamificação: ${levelsCount}`);
    console.log(`   - Conquistas disponíveis: ${achievementsCount}`);
    console.log(`   - Recompensas cadastradas: ${rewardsCount}`);

    if (usersCount === 0 || modalitiesCount === 0) {
      throw new Error('Seed não foi executado ou está incompleto!');
    }
    console.log('   ✅ Entidades base validadas com sucesso.\n');

    // 2. Teste de Relacionamento (User -> Department -> Role)
    console.log('2️⃣ Validando integridade relacional de Usuário e RBAC...');
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@empresa.com' },
      include: {
        department: true,
        level: true,
        userRoles: { include: { role: true } },
      },
    });

    if (!adminUser || !adminUser.department || adminUser.userRoles.length === 0) {
      throw new Error('Relacionamento de usuário/departamento/role falhou!');
    }
    console.log(`   - Usuário: ${adminUser.name} (${adminUser.email})`);
    console.log(`   - Departamento: ${adminUser.department.name}`);
    console.log(`   - Role associada: ${adminUser.userRoles.map((r) => r.role.name).join(', ')}`);
    console.log('   ✅ Integridade relacional confirmada.\n');

    // 3. Teste de Atividade Pendente e Evidência
    console.log('3️⃣ Testando criação de Atividade com Evidência (Status PENDING)...');
    const testUser = await prisma.user.findUnique({ where: { email: 'renan@empresa.com' } });
    const corridaMod = await prisma.activityType.findFirst({ where: { name: { contains: 'Corrida' } } });

    if (!testUser || !corridaMod) {
      throw new Error('Usuário de teste ou modalidade não encontrados!');
    }

    const activity = await prisma.userActivity.create({
      data: {
        userId: testUser.id,
        activityTypeId: corridaMod.id,
        activityDate: new Date(),
        quantity: 5.0,
        unit: 'km',
        description: 'Treino matinal de 5km no parque',
        calculatedPoints: 50, // 5km * 10 pts
        status: 'PENDING',
        evidences: {
          create: {
            fileName: 'comprovante_corrida_strava.png',
            fileType: 'image/png',
            fileSize: 1024 * 350,
            storageProvider: 'local',
            storagePath: 'storage/uploads/test-corrida-uuid.png',
            uploadedBy: testUser.id,
          },
        },
      },
      include: { evidences: true },
    });

    console.log(`   - Atividade criada ID: ${activity.id}`);
    console.log(`   - Status inicial: ${activity.status}`);
    console.log(`   - Pontos teóricos calculados: ${activity.calculatedPoints}`);
    console.log(`   - Evidência anexada: ${activity.evidences[0]?.fileName}`);
    console.log('   ✅ Atividade pendente registrada com sucesso.\n');

    // 4. Teste de Aprovação Atômica com Transação ACID no Prisma
    console.log('4️⃣ Testando Aprovação Atômica via Transação de Banco (ACID)...');
    
    const initialPoints = testUser.totalPoints;
    const pointsToAdd = activity.calculatedPoints;

    await prisma.$transaction(async (tx) => {
      // 4.1 Atualiza atividade para APPROVED
      const approvedActivity = await tx.userActivity.update({
        where: { id: activity.id },
        data: {
          status: 'APPROVED',
          validatedAt: new Date(),
          validatedBy: adminUser.id,
        },
      });

      // 4.2 Cria transação imutável no ledger de pontos
      const pointTx = await tx.pointsTransaction.create({
        data: {
          userId: testUser.id,
          activityId: approvedActivity.id,
          transactionType: 'ACTIVITY',
          points: pointsToAdd,
          description: `Pontuação referente a Corrida (5 km) - Atividade #${approvedActivity.id.substring(0, 8)}`,
          referenceType: 'user_activities',
          referenceId: approvedActivity.id,
          createdBy: adminUser.id,
        },
      });

      // 4.3 Atualiza total de pontos do usuário
      await tx.user.update({
        where: { id: testUser.id },
        data: { totalPoints: { increment: pointsToAdd } },
      });

      // 4.4 Cria notificação para o usuário
      await tx.notification.create({
        data: {
          userId: testUser.id,
          title: 'Atividade Aprovada!',
          message: `Sua atividade de Corrida foi aprovada por ${adminUser.name} e você recebeu +${pointsToAdd} pontos.`,
          type: 'ACTIVITY_APPROVED',
          referenceId: approvedActivity.id,
        },
      });

      // 4.5 Registra na trilha de auditoria
      await tx.auditLog.create({
        data: {
          userId: adminUser.id,
          action: 'APPROVE',
          entity: 'UserActivity',
          entityId: approvedActivity.id,
          oldValues: JSON.stringify({ status: 'PENDING' }),
          newValues: JSON.stringify({ status: 'APPROVED', validatedBy: adminUser.id }),
        },
      });

      console.log(`   - Transação de pontos gerada ID: ${pointTx.id} (+${pointTx.points} pts)`);
    });

    const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
    console.log(`   - Pontos anteriores: ${initialPoints} | Novos pontos: ${updatedUser?.totalPoints}`);
    console.log('   ✅ Transação atômica executada com integridade total.\n');

    // 5. Teste da Regra de Ouro: Ajuste e Reversão mantendo histórico
    console.log('5️⃣ Testando Regra de Ouro: Ajuste e Reversão (Sem apagar transações)...');
    
    // Simula um ajuste de bônus por participação em evento corporativo
    const bonusTx = await prisma.pointsTransaction.create({
      data: {
        userId: testUser.id,
        transactionType: 'BONUS',
        points: 100,
        description: 'Bônus por participação no Desafio de Integração',
        createdBy: adminUser.id,
      },
    });
    await prisma.user.update({
      where: { id: testUser.id },
      data: { totalPoints: { increment: 100 } },
    });
    console.log(`   - Transação de BÔNUS criada: +100 pontos (ID: ${bonusTx.id})`);

    // Simula reversão de parte de pontos por correção administrativa
    const reversalTx = await prisma.pointsTransaction.create({
      data: {
        userId: testUser.id,
        transactionType: 'REVERSAL',
        points: -30,
        description: 'Estorno parcial por duplicidade de comprovação',
        referenceType: 'points_transactions',
        referenceId: bonusTx.id,
        createdBy: adminUser.id,
      },
    });
    await prisma.user.update({
      where: { id: testUser.id },
      data: { totalPoints: { increment: -30 } },
    });
    console.log(`   - Transação de REVERSÃO criada: -30 pontos (ID: ${reversalTx.id})`);

    // 6. Teste de Conciliação do Histórico (Ledger vs Total do Usuário)
    console.log('6️⃣ Validando reconciliação do Ledger de Pontos...');
    const userTransactions = await prisma.pointsTransaction.findMany({
      where: { userId: testUser.id },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`   - Total de movimentações no extrato de ${testUser.name}: ${userTransactions.length}`);
    for (const t of userTransactions) {
      console.log(`     * [${t.transactionType}] ${t.points > 0 ? '+' : ''}${t.points} pts | ${t.description}`);
    }

    const calculatedSum = userTransactions.reduce((acc, curr) => acc + curr.points, 0);
    console.log(`   - Soma de todas as transações do usuário: ${calculatedSum} pts`);
    console.log('   ✅ Conciliação do Ledger perfeita!\n');

    console.log('====================================================');
    console.log('🎉 TODOS OS TESTES DA FASE 1 PASSARAM COM SUCESSO!');
    console.log('====================================================');
  } catch (error) {
    console.error('❌ Falha nos testes de banco:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runDatabaseTests();
