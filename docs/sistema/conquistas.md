# Conquistas (Badges)

## Cadastro (`Achievement`)

Administrável, sem limite de quantidade. Cada conquista tem: nome (único), descrição, ícone, categoria, nível visual (`BRONZE`/`PRATA`/`OURO` — só estético, não afeta a regra), `pointsReward` (crédito ao desbloquear — pode ser 0), um `ruleType` + `ruleValue` (o critério de desbloqueio) e `status` (`ACTIVE`/`INACTIVE`).

### Ícone

Mesmo padrão de avatar de usuário: `iconType = EMOJI` (o campo `icon` guarda um emoji/identificador de texto) ou `iconType = UPLOAD` (o admin envia uma imagem PNG/SVG/JPG, servida por um endpoint próprio do backend — nunca expõe o caminho de armazenamento cru). Criar ou editar uma conquista aceita os dois modos.

## Os 8 tipos de critério (`ruleType`)

Cada um exige um formato específico de `ruleValue` (JSON) e é avaliado por um bloco de código dedicado — **não é um motor genérico configurável sem código**; adicionar um 9º tipo exige alterar `achievement.service.ts` em vários pontos (validação, avaliação de desbloqueio, e cálculo de progresso), além do frontend.

| `ruleType` | `ruleValue` esperado | Critério |
|---|---|---|
| `ACTIVITY_COUNT` | `{ count }` | Nº de atividades aprovadas (qualquer modalidade) ≥ `count` |
| `TOTAL_POINTS` | `{ minPoints }` | `lifetimePoints` (vitalício — **não** `totalPoints`) ≥ `minPoints`. Deliberadamente imune à regra "sem ciclo ativo, não conta" (ver [ciclos.md](./ciclos.md)) e a `CYCLE_RESET`: essas 3 conquistas (Centena/Clube dos 1.000/Milionário de Pontos) são marcos de vida toda, não do ciclo atual |
| `STREAK_DAYS` | `{ days }` | Maior sequência de dias consecutivos com pelo menos 1 atividade aprovada ≥ `days` |
| `SPECIFIC_MODALITY` | `{ activityTypeId, count? }` | Nº de atividades aprovadas **daquela modalidade** ≥ `count` (padrão 1) |
| `CUMULATIVE_QUANTITY` | `{ activityTypeId, targetQuantity }` | Soma da `quantity` de atividades aprovadas daquela modalidade ≥ `targetQuantity` |
| `DISTINCT_MODALITIES` | `{ count }` | Nº de modalidades **diferentes** já praticadas (com pelo menos 1 aprovação cada) ≥ `count` |
| `RANKING_POSITION` | `{ maxPosition }` | Posição atual no ranking geral ≤ `maxPosition` (quanto menor a posição, melhor — "Top 3", por exemplo) |
| `ACCOUNT_TENURE_DAYS` | `{ days }` | Dias desde a criação da conta ≥ `days` |

Para `SPECIFIC_MODALITY`/`CUMULATIVE_QUANTITY`, o `activityTypeId` também é espelhado numa coluna própria da tabela (`Achievement.activityTypeId`), só para filtro/agrupamento administrativo — a avaliação real do critério sempre lê o `ruleValue`, nunca essa coluna.

## Motor de desbloqueio automático (`checkAndUnlock`)

Roda **dentro da mesma transação atômica** de qualquer crédito/débito de pontos (`ScoringService.creditPoints`), exceto em `CYCLE_RESET` (ver [pontuacao.md](./pontuacao.md) para o porquê). A cada chamada:

1. Pega todas as conquistas `ACTIVE` que o usuário ainda não tem.
2. Avalia cada uma contra os dados atuais (nunca contra um valor em cache).
3. Para cada critério satisfeito: registra `UserAchievement` (nunca duplica — é `unique(userId, achievementId)`), notifica (`ACHIEVEMENT_UNLOCKED`) e, se `pointsReward > 0`, credita uma transação `ACHIEVEMENT` no ledger.
4. Se algum ponto foi concedido no laço, reclassifica o nível ao final (uma vez, considerando a soma de tudo que foi concedido nessa passada).

**Limitação deliberada**: cada conquista é avaliada uma única vez por chamada — não há recursão. Se o prêmio de uma conquista A (ex.: +500 pontos) fizer a pessoa cruzar o limiar de uma conquista B do tipo `TOTAL_POINTS` na mesma passada, B só é detectada na **próxima** transação de pontos do usuário, não instantaneamente. Decisão consciente para manter a lógica simples e previsível.

Uma conquista é **vitalícia**: uma vez concedida, nunca é removida, mesmo que o admin desative ou exclua a conquista depois.

## Progresso (grade "Minhas Conquistas")

`GET /achievements/users/:userId/progress` devolve o catálogo inteiro (ativas + qualquer uma já desbloqueada, mesmo desativada depois) com `{ current, target, percent }` calculado na hora para as ainda bloqueadas — nunca um valor persistido. Para `RANKING_POSITION`, o "quanto menor melhor" inverte o cálculo do percentual (`lowerIsBetter: true`) para a barra de progresso continuar fazendo sentido visualmente.

## Exclusão

Uma conquista nunca concedida a ninguém é excluída de verdade. Uma já concedida (tem `UserAchievement` ou `PointsTransaction` vinculados) só é desativada (`status = INACTIVE`) — preserva o histórico de quem já a tem, mas ela para de ser candidata a novos desbloqueios.

## Visibilidade

Conquistas desbloqueadas e o progresso de qualquer colega são **públicos a qualquer usuário autenticado** — não restritos a "dono ou admin". Essa é uma decisão de transparência tomada junto com a seção "Participantes" (ver [ranking-e-participantes.md](./ranking-e-participantes.md)): o perfil de um colega mostra as mesmas conquistas e progresso que o próprio perfil mostraria.

## Sequência atual de dias (card do Dashboard + notificação de marco)

Incentivo ao uso diário (a pedido do usuário, inspirado em Duolingo/Headspace/Snapchat) — **diferente** da conquista `STREAK_DAYS` acima:

| | `STREAK_DAYS` (conquista) | Sequência atual (Dashboard) |
|---|---|---|
| O que mede | Maior sequência **de todos os tempos** (recorde histórico) | Sequência **viva agora** — dias seguidos até hoje |
| Nunca diminui | Sim — é um recorde, só cresce ou se mantém | Não — zera se passar 1 dia sem nenhuma atividade aprovada |
| Onde aparece | Progresso da conquista (grade "Minhas Conquistas") | Card "🔥 X dias" sempre visível no Dashboard (mesmo com 0) |
| Função de cálculo | `computeMaxStreakDays` | `computeCurrentStreakDays` |

Ambas vivem em `shared/utils/streak.util.ts`, operam sobre o mesmo dado-fonte (`activityDate` de atividades `APPROVED`, deduplicado por dia de calendário) e usam a mesma regra de "não quebra até o dia terminar": se a pessoa já fez algo hoje, conta a partir de hoje; se não fez nada hoje mas fez ontem, a sequência continua viva (ainda não acabou o dia de hoje) — só zera se nem hoje nem ontem tiver nada.

**Notificação de marco (`STREAK_MILESTONE`)**: disparada dentro de `AdminActivityService.approve()` (mesma transação da aprovação, manual ou automática) quando a sequência atual bate exatamente 3, 7, 14, 30, 60 ou 100 dias — frases variam por marco (ver `admin-activity.service.ts`, `STREAK_MILESTONE_MESSAGES`). Duas salvaguardas pra não gerar ruído:

- **Só na primeira aprovação do dia**: aprovar uma segunda atividade no mesmo dia não recalcula pra um marco diferente (a sequência já contou aquele dia), então não dispara de novo.
- **Só se a atividade aprovada for de HOJE**: aprovar uma atividade atrasada (`activityDate` de dias passados) nunca dispara a notificação — isso evitaria uma mensagem de "parabéns pelos 7 dias" aparecendo num momento sem relação com a sequência real da pessoa naquele instante.
