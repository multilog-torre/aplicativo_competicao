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
| `TOTAL_POINTS` | `{ minPoints }` | `totalPoints` atual ≥ `minPoints` |
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
