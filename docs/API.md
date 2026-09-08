# Documentação da API REST — Sistema Corporativo de Gamificação

## Visão Geral
A API REST utiliza Node.js, TypeScript e Express, operando sob o prefixo `/api/v1` com respostas estruturadas de forma consistente e documentação interativa via Swagger OpenAPI em `/api/docs`.

---

## 1. Padrão de Respostas

### Resposta de Sucesso (HTTP 2xx)
```json
{
  "success": true,
  "data": {},
  "meta": {
    "total": 6
  }
}
```

### Resposta de Erro (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Acesso negado. Esta operação requer o perfil ADMIN"
  }
}
```

---

## 2. Endpoints de Modalidades de Atividades (Fase 4)

### `GET /api/v1/activity-types`
Lista todas as modalidades de atividades disponíveis.
- **Query Params (Opcionais)**:
  - `category`: `SPORTS`, `HEALTH`, `EDUCATION`, `SOCIAL`, `OTHER`
  - `status`: `ACTIVE`, `INACTIVE`
  - `search`: Texto de busca no nome ou descrição

### `GET /api/v1/activity-types/:id`
Busca os detalhes completos, regras e pontuação de uma modalidade por ID.

### `POST /api/v1/activity-types`
Cria uma nova modalidade dinâmica no sistema.
- **Proteção**: Requer Autenticação e perfil `ADMIN` ou `ADMIN_MASTER`.
- **Body**:
  ```json
  {
    "name": "Natação",
    "description": "Treino de natação em piscina ou mar",
    "category": "SPORTS",
    "icon": "waves",
    "rulesDescription": "20 pontos para cada 500 metros nadados",
    "scoringType": "QUANTITY",
    "basePoints": 20,
    "unit": "metros",
    "multiplier": 0.04,
    "dailyLimit": 3000,
    "requiresEvidence": true,
    "allowedFileTypes": "jpg,jpeg,png"
  }
  ```

### `PATCH /api/v1/activity-types/:id`
Atualiza os dados, pontuações ou regras de uma modalidade existente.
- **Proteção**: Requer perfil `ADMIN` ou `ADMIN_MASTER`.

### `DELETE /api/v1/activity-types/:id`
Exclui a modalidade (se não houver atividades vinculadas) ou a inativa com Soft Delete (se houver histórico).
- **Proteção**: Requer perfil `ADMIN` ou `ADMIN_MASTER`.

---

## 2.1 Endpoints do Motor de Pontuação (Fase 5)

O cálculo de pontos ocorre **exclusivamente no backend**. O frontend nunca envia `points` como
valor oficial — apenas `activityTypeId` e `quantity`.

### `POST /api/v1/scoring/simulate`
Simula (preview) a pontuação antes de submeter a atividade. Não grava nada no banco.
- **Proteção**: qualquer usuário autenticado.
- **Body**: `{ "activityTypeId": "uuid", "quantity": 7.5 }`
- **Retorna**: `calculatedPoints`, `breakdown` (memória de cálculo) e `limitWarning` quando o
  limite diário/semanal/mensal da modalidade já foi atingido.

Fórmulas por `scoringType`:
| Tipo | Fórmula | Exemplo |
|---|---|---|
| `FIXED` | `basePoints` (quantidade ignorada) | Academia = 20 pts |
| `QUANTITY` | `quantity × basePoints` | 7,5 km × 10 = 75 pts |
| `TIME` | `quantity × basePoints` | 30 min × 1 = 30 pts |
| `MULTIPLIER` | `quantity × multiplier` | 500 × 0,1 = 50 pts |

### `GET /api/v1/scoring/transactions`
Histórico do ledger oficial de pontos, com paginação.
- **Proteção**: autenticado. Participante vê **apenas o próprio histórico**; `ADMIN` /
  `ADMIN_MASTER` podem filtrar por `userId`.
- **Query Params**: `userId` (só admin), `transactionType`, `page`, `limit` (máx. 100).

### `POST /api/v1/scoring/manual`
Lançamento manual de pontos com origem rastreável.
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Body**: `{ "userId": "uuid", "transactionType": "BONUS|PENALTY|ADJUSTMENT", "points": 100, "description": "motivo" }`
- `PENALTY` é sempre gravado com sinal negativo no ledger.
- Gera registro em `audit_logs` com saldo anterior e novo.

### `POST /api/v1/scoring/transactions/:id/reverse`
Reverte uma transação **sem apagá-la** — cria uma transação `REVERSAL` de sinal oposto.
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Body**: `{ "reason": "motivo da reversão" }`
- `409 ALREADY_REVERSED` se já houver reversão; `422 CANNOT_REVERSE_REVERSAL` ao tentar reverter
  uma reversão.

> **Atomicidade**: `creditPoints` grava a transação e atualiza `users.total_points` dentro de um
> único `prisma.$transaction`. Nunca existe ponto creditado sem lançamento no ledger.

---

## 2.2 Endpoints de Registro de Atividades (Fase 6)

O usuário registra a prática de uma atividade em uma modalidade. O backend calcula os pontos
imediatamente (via o mesmo motor da Fase 5) e os armazena em `calculatedPoints` **apenas como
previsão** — nenhuma `points_transaction` é criada e `users.total_points` não muda neste momento.
O crédito oficial só ocorre na aprovação administrativa (Fase 8, ainda não implementada).

> **Evidências**: o envio de arquivo/comprovante depende da integração de storage da Fase 7
> (ainda não aprovada) e por isso não está disponível nesta fase, conforme a regra de
> dependências do planejamento (§29).

### `POST /api/v1/activities`
Registra uma nova atividade. Status inicial sempre `PENDING`.
- **Proteção**: qualquer usuário autenticado.
- **Body**:
  ```json
  {
    "activityTypeId": "uuid",
    "activityDate": "2026-09-04T10:00:00.000Z",
    "quantity": 5,
    "description": "Corrida matinal no parque."
  }
  ```
- **Validações**: modalidade deve existir e estar `ACTIVE`; data não pode ser no futuro;
  quantidade deve ser positiva; limites diário/semanal/mensal da modalidade (baseados em
  atividades já aprovadas) são respeitados — `422 LIMIT_EXCEEDED` quando excedidos.

### `GET /api/v1/activities`
Lista atividades com paginação.
- **Proteção**: autenticado. Participante vê **apenas as próprias**; `ADMIN`/`ADMIN_MASTER`
  podem filtrar por `userId`.
- **Query Params**: `userId` (só admin), `activityTypeId`, `status`, `page`, `limit`.

### `GET /api/v1/activities/:id`
Detalhe completo de uma atividade (inclui modalidade, validador, evidências e transações
associadas, quando existirem).
- **Proteção**: participante só acessa as próprias (`403` caso contrário); admin acessa qualquer uma.

---

## 2.3 Endpoints de Upload e Evidências (Fase 7)

Arquivos ficam **fora** de qualquer pasta servida estaticamente — o acesso só é possível pelo
endpoint de download autorizado, nunca por URL direta (planejamento.md §7/§Fase 8 "Segurança").
A gravação física é abstraída por um `StorageProvider` (`local` hoje; `azure`/`s3` reservados
para quando o deploy em nuvem for aprovado, sem alterar nenhuma regra de negócio).

### `POST /api/v1/activities/:id/evidence`
Envia um arquivo de evidência vinculado a uma atividade.
- **Proteção**: apenas o autor da atividade, e somente enquanto ela estiver `PENDING`.
- **Body**: `multipart/form-data` com o campo `file`.
- **Validações**: extensão deve estar em `activityType.allowedFileTypes`; o `mimetype`
  declarado deve corresponder à extensão (ex.: `.jpg` só aceita `image/jpeg`); tamanho máximo
  configurável via `MAX_UPLOAD_SIZE_MB` (padrão 10MB) — excedentes retornam `422 UPLOAD_ERROR`
  (limite do Multer) ou `422 FILE_TOO_LARGE` (checagem de aplicação).
- **Retorna**: metadados (`id`, `fileName`, `fileType`, `fileSize`, `createdAt`, `downloadUrl`) —
  nunca o caminho físico do arquivo.

### `GET /api/v1/activities/:id/evidence`
Lista os metadados das evidências de uma atividade.
- **Proteção**: dono da atividade ou `ADMIN`/`ADMIN_MASTER`.

### `GET /api/v1/activities/:id/evidence/:evidenceId/download`
Download autorizado do conteúdo binário do arquivo.
- **Proteção**: dono da atividade ou `ADMIN`/`ADMIN_MASTER` — qualquer outro usuário recebe `403`.
- Serve o arquivo através do backend (`Content-Type`/`Content-Disposition`), nunca por link direto
  ao storage.

---

## 2.4 Endpoints de Validação Administrativa (Fase 8)

Fluxo oficial de aprovação (planejamento.md §32) executado como **uma única transação atômica**:
valida a atividade → altera o status → cria a `points_transaction` → atualiza `users.total_points`
→ registra auditoria. Se qualquer etapa falhar, tudo é revertido (`ROLLBACK`) — nunca existe uma
atividade `APPROVED` sem os pontos correspondentes no ledger, nem o contrário.

> Verificação de nível, conquistas, desafios e notificações disparados pela aprovação ficam para
> as Fases 11, 12, 13 e 16 respectivamente (ainda não aprovadas — regra de dependências §29).

### `GET /api/v1/admin/activities/pending`
Lista a fila de atividades aguardando avaliação, da mais antiga para a mais nova.
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Query Params**: `userId`, `activityTypeId`, `page`, `limit`.

### `POST /api/v1/admin/activities/:id/approve`
Aprova a atividade e credita os pontos.
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Validações**: atividade deve estar `PENDING` (`422 ACTIVITY_ALREADY_EVALUATED` caso contrário);
  se a modalidade exige comprovação (`requiresEvidence`), é obrigatório existir ao menos uma
  evidência anexada (`422 EVIDENCE_REQUIRED`).
- **Retorna**: a atividade atualizada, a `points_transaction` criada e o novo total do usuário.

### `POST /api/v1/admin/activities/:id/reject`
Rejeita a atividade. Nenhum ponto é creditado.
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Body**: `{ "reason": "motivo com pelo menos 5 caracteres" }` — obrigatório.

---

## 2.5 Endpoints de Auditoria (Fase 9)

Toda operação crítica do sistema já grava um registro em `audit_logs` desde as fases em que foi
introduzida: login/logout (Fase 3), CRUD de modalidades (Fase 4), lançamento manual e reversão de
pontos (Fase 5), upload de evidência (Fase 7), aprovação e rejeição de atividades (Fase 8). A Fase
9 expõe essa trilha para consulta.

> **Segregação de funções**: como a trilha audita inclusive as ações dos próprios `ADMIN`s
> (aprovações, rejeições, alterações de modalidade), o acesso é restrito a **`ADMIN_MASTER`** —
> o perfil de governança da plataforma. Um `ADMIN` comum não consegue auditar as próprias ações.

### `GET /api/v1/admin/audit-logs`
Lista a trilha de auditoria, mais recente primeiro.
- **Proteção**: `ADMIN_MASTER`.
- **Query Params**: `userId` (quem realizou a ação), `action` (ex.: `APPROVE_ACTIVITY`,
  `LOGIN`, `MANUAL_POINTS`, `REVERSAL`, `UPDATE`), `entity` (ex.: `UserActivity`, `ActivityType`,
  `PointsTransaction`), `entityId`, `dateFrom`, `dateTo`, `page`, `limit`.
- Cada item retorna `oldValues`/`newValues` já desserializados (objeto JSON, não string).

### `GET /api/v1/admin/audit-logs/:id`
Detalhe de um registro específico — identifica quem, o quê, quando, valor anterior e novo.
- **Proteção**: `ADMIN_MASTER`.

---

## 2.6 Endpoint de Ranking (Fase 10)

O ranking é calculado **sempre a partir do ledger imutável** (`points_transactions`), nunca de um
valor em cache — nem `users.total_points` é usado diretamente como fonte para os filtros de
período, já que ele só representa o total vitalício. Isso garante que o ranking mude
automaticamente assim que uma atividade for aprovada (Fase 8) e uma nova transação for criada.

### `GET /api/v1/ranking`
- **Proteção**: qualquer usuário autenticado.
- **Query Params**:
  - `period`: `GENERAL` (padrão, vitalício) | `WEEK` | `MONTH` | `YEAR`
  - `activityTypeId`: filtra pontos ganhos apenas naquela modalidade (`404` se inexistente)
  - `departmentId`: restringe o ranking aos usuários daquele departamento (`404` se inexistente)
  - `page`, `limit` (máx. 100)
- **Regra de empate**: pontuações iguais são ordenadas alfabeticamente pelo nome.
- **Inclusão completa**: todo usuário `ACTIVE` aparece no ranking, mesmo com `points: 0` no
  período filtrado — não apenas quem pontuou.
- Cada item retorna `position`, `userId`, `name`, `avatarType`, `avatarUrl`, `department`,
  `points` (soma no filtro aplicado) e `totalPointsAllTime` (referência, total vitalício).

> **Limitação conhecida**: o filtro `activityTypeId` soma apenas transações do tipo `ACTIVITY`
> diretamente ligadas a uma atividade daquela modalidade. Uma eventual `REVERSAL` de uma dessas
> atividades não é reatribuída à modalidade de origem nesta versão — o ranking `GENERAL` (sem
> filtro de modalidade) não tem essa limitação, pois soma todas as transações do usuário.

---

## 2.7 Endpoints de Níveis de Progressão (Fase 11)

Os níveis são configuráveis pelo administrador sem alterar código (mesmo padrão de Modalidades).
**A reclassificação de nível é automática**: sempre que `ScoringService.creditPoints` altera o
total de um usuário (aprovação de atividade, bônus, penalidade, ajuste ou reversão), o nível é
recalculado **na mesma transação atômica** — nunca fica dessincronizado do total de pontos.

### `GET /api/v1/levels` / `GET /api/v1/levels/:id`
Lista a escada de níveis (pública, mesmo padrão de `/activity-types`).

### `POST /api/v1/levels` · `PATCH /api/v1/levels/:id` · `DELETE /api/v1/levels/:id`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- `levelNumber` e `minPoints` são únicos — duplicidade retorna `409 CONFLICT`.
- **Efeito colateral automático**: criar, editar ou excluir um nível **reclassifica todos os
  usuários** com base nas faixas resultantes (uma mudança de `minPoints` pode reposicionar quem
  já está classificado). Excluir um nível em uso primeiro desvincula os usuários afetados e depois
  os reatribui ao nível correto entre os remanescentes — nunca deixa um usuário "sem nível" nem
  bloqueia a exclusão por causa de uma foreign key.
- **Regra de piso**: se o total de um usuário for menor que o `minPoints` de todos os níveis
  configurados (ex.: após uma penalidade pesada, deixando o saldo negativo), ele é classificado no
  nível de menor `minPoints` — nunca fica sem nível algum enquanto existir ao menos um configurado.

---

## 2.8 Endpoints de Conquistas (Fase 12)

O backend verifica e desbloqueia conquistas **automaticamente** sempre que os pontos de um usuário
mudam (`ScoringService.creditPoints`) — aprovação de atividade, bônus, penalidade, ajuste ou
reversão —, na mesma transação atômica da Fase 11 (crédito de pontos → nível → conquistas).

### Tipos de regra (`ruleType`)
| ruleType | ruleValue | Critério |
|---|---|---|
| `ACTIVITY_COUNT` | `{ count }` | N ou mais atividades **aprovadas** (qualquer modalidade) |
| `TOTAL_POINTS` | `{ minPoints }` | Total de pontos do ledger >= N |
| `STREAK_DAYS` | `{ days }` | Maior sequência histórica de dias consecutivos com atividade aprovada |
| `SPECIFIC_MODALITY` | `{ activityTypeId, count? }` | N ou mais atividades aprovadas de uma modalidade específica (padrão N=1) |

### `GET /api/v1/achievements` / `GET /api/v1/achievements/:id`
Catálogo de conquistas (público, mesmo padrão de `/levels`).

### `GET /api/v1/achievements/users/:userId`
Conquistas desbloqueadas por um usuário. Dono ou `ADMIN`/`ADMIN_MASTER` (`403` para os demais).

### `POST /api/v1/achievements` · `PATCH /api/v1/achievements/:id` · `DELETE /api/v1/achievements/:id`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- `ruleValue` é validado conforme o `ruleType` (`422 INVALID_RULE_VALUE` se a forma não corresponder).
- Excluir uma conquista já concedida a algum usuário a **desativa** em vez de apagar (preserva o
  histórico do ledger, mesma regra de ouro usada em Modalidades).

> **Escopo desta fase**: cada chamada de crédito de pontos verifica as conquistas uma única vez.
> Se o próprio prêmio de uma conquista cruzar o limiar de outra, esse segundo desbloqueio só
> ocorre na próxima transação de pontos do usuário — decisão deliberada para evitar recursão.

---

## 2.9 Endpoints de Desafios (Fase 13)

O progresso é acumulado a partir da `quantity` das atividades **aprovadas** do participante,
dentro do período do desafio (e da modalidade, se especificada). Atualizado automaticamente na
mesma transação atômica do crédito de pontos (Fase 5 → 11 → 12 → 13).

> **`effectiveStatus`** é sempre calculado a partir de `startDate`/`endDate` (`UPCOMING` | `ACTIVE`
> | `COMPLETED`), exceto quando o admin cancela explicitamente (`CANCELLED`) — nunca fica
> dessincronizado das datas por esquecimento.

### `GET /api/v1/challenges` / `GET /api/v1/challenges/:id`
Catálogo de desafios (público). Filtros: `effectiveStatus`, `scope`, `page`, `limit`.

### `POST /api/v1/challenges/:id/join`
Participação voluntária em um desafio `ACTIVE`.
- **Proteção**: qualquer usuário autenticado.
- **Progresso retroativo**: ao entrar, soma automaticamente as atividades já aprovadas dentro do
  período do desafio — quem entra no meio do mês não perde o que já fez.
- `409 ALREADY_JOINED` se já estiver participando; `422 CHALLENGE_NOT_ACTIVE` fora do período.

### `GET /api/v1/challenges/:id/my-progress`
Progresso do próprio usuário no desafio (`404` se ainda não participa).

### `GET /api/v1/challenges/:id/participants`
Leaderboard do desafio — participantes ordenados por progresso (empate: nome, mesma regra da
Fase 10).

### `GET /api/v1/challenges/:id/departments`
Progresso agregado por departamento (soma do `currentProgress` dos participantes de cada
departamento) — visão de "equipes", útil para desafios de escopo `DEPARTMENT`/`COMPANY`.

### `POST /api/v1/challenges` · `PATCH /api/v1/challenges/:id` · `DELETE /api/v1/challenges/:id`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- `startDate` deve ser anterior a `endDate` (`422 INVALID_DATE_RANGE` caso contrário).
- Excluir um desafio com participantes ou pontos já concedidos **cancela** em vez de apagar
  (preserva o histórico do ledger).

---

## 2.10 Endpoints de Premiações (Fase 14)

O resgate debita pontos através do **mesmo motor de pontuação oficial** (`ScoringService.creditPoints`,
reaproveitado da Fase 5) — o débito também reavalia nível e conquistas, exatamente como qualquer
outro crédito/débito do sistema.

### `GET /api/v1/rewards` / `GET /api/v1/rewards/:id`
Catálogo de premiações (público). Por padrão, esconde itens `INACTIVE`.

### `POST /api/v1/rewards/:id/redeem`
Resgata uma premiação, debitando `pointsCost` do usuário.
- **Proteção**: qualquer usuário autenticado.
- `422 INSUFFICIENT_POINTS`, `422 REWARD_UNAVAILABLE`, `422 OUT_OF_STOCK` conforme o caso.
- Estoque decrementado atomicamente; ao chegar a 0, o status muda automaticamente para
  `OUT_OF_STOCK`.

### `GET /api/v1/rewards/redemptions` / `GET /api/v1/rewards/redemptions/:id`
Histórico de resgates. Participante vê apenas os próprios; `ADMIN`/`ADMIN_MASTER` podem filtrar
por `userId`.

### Ciclo de vida do resgate (`ADMIN`/`ADMIN_MASTER`)
```
REQUESTED → POST /rewards/redemptions/:id/approve  → APPROVED
APPROVED  → POST /rewards/redemptions/:id/deliver  → DELIVERED (terminal)
REQUESTED/APPROVED → POST /rewards/redemptions/:id/cancel → CANCELLED (terminal)
```
- Transição fora de ordem retorna `422 INVALID_STATUS_TRANSITION`.
- **Cancelamento estorna automaticamente** os pontos (cria uma transação `REVERSAL` da transação
  `REWARD` original, reaproveitando `ScoringService.reverseTransaction` da Fase 5) e devolve 1
  unidade ao estoque, reativando o item se estava `OUT_OF_STOCK`. Não é possível cancelar um
  resgate já `DELIVERED`.

### `POST /api/v1/rewards` · `PATCH /api/v1/rewards/:id` · `DELETE /api/v1/rewards/:id`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- Excluir uma premiação já resgatada por alguém a desativa em vez de apagar (preserva o histórico).

---

## 2.11 Endpoints do Mural Social (Fase 15)

Todo o mural exige autenticação (é conteúdo interno da corporação, diferente dos catálogos
públicos de Modalidades/Níveis/Conquistas). O upload de foto reaproveita o mesmo `StorageProvider`
privado da Fase 7 — a imagem nunca é exposta por URL direta, apenas pelo endpoint de download
autorizado.

### `POST /api/v1/posts`
Cria uma publicação. `multipart/form-data` com o campo de texto `content` e, opcionalmente, `file`
(imagem jpg/jpeg/png).

### `GET /api/v1/posts` / `GET /api/v1/posts/:id`
Feed do mural. Por padrão mostra publicações `PUBLISHED` de todos + as próprias do usuário
(mesmo que ocultas/moderadas, para que ele saiba o que aconteceu com o que postou).
`ADMIN`/`ADMIN_MASTER` podem filtrar por `?status=HIDDEN|MODERATED` (fila de moderação).

### `DELETE /api/v1/posts/:id`
Exclui a publicação. Dono exclui a própria (ação rotineira, sem auditoria); `ADMIN`/`ADMIN_MASTER`
podem excluir qualquer uma (gera auditoria `DELETE_POST`).

### `POST /api/v1/posts/:id/moderate`
Modera uma publicação sem excluí-la — `{ "action": "HIDE"|"MODERATE"|"RESTORE", "reason"? }`.
- **Proteção**: `ADMIN`/`ADMIN_MASTER`. Sempre gera auditoria `MODERATE_POST`.

### `GET /api/v1/posts/:id/image`
Download autorizado da foto do post (dono, ou qualquer autenticado se `PUBLISHED`).

### Curtidas e comentários
| Rota | Descrição |
|---|---|
| `POST` / `DELETE /posts/:id/like` | Curtir / descurtir (`409 ALREADY_LIKED` em curtida duplicada) |
| `GET /posts/:id/likes` | Quem curtiu |
| `POST /posts/:id/comments` | Comentar (bloqueado em post não `PUBLISHED` — `422 POST_NOT_COMMENTABLE`) |
| `GET /posts/:id/comments` | Listar comentários |
| `DELETE /posts/:id/comments/:commentId` | Autor do comentário exclui o próprio; admin modera qualquer um (auditado) |

---

## 2.12 Endpoints de Notificações (Fase 16)

Notificações são geradas **automaticamente pelo backend** nos pontos de origem de cada evento —
nunca pelo frontend. Todas as rotas são sempre escopadas ao próprio usuário autenticado.

| Evento | `type` | Onde é disparada |
|---|---|---|
| Atividade aprovada | `ACTIVITY_APPROVED` | `AdminActivityService.approve` |
| Atividade rejeitada | `ACTIVITY_REJECTED` | `AdminActivityService.reject` |
| Pontos ajustados manualmente ou estornados | `POINTS_ADJUSTED` | `ScoringService.manualTransaction` / `reverseTransaction` |
| Subida no ranking geral | `RANKING_UP` | `ScoringService.creditPoints` (apenas em aprovações de atividade) |
| Novo nível alcançado | `LEVEL_UP` | `LevelService.recalculateForUser` (só em subida, nunca em queda) |
| Conquista desbloqueada | `ACHIEVEMENT_UNLOCKED` | `AchievementService.checkAndUnlock` |
| Desafio concluído | `CHALLENGE_COMPLETED` | `ChallengeService.awardCompletion` |
| Resgate aprovado/entregue/cancelado | `REWARD_UPDATE` | `RewardService.approveRedemption` / `deliverRedemption` / `cancelRedemption` |

> **Escopo de "subida no ranking"**: verificar a posição de todos os usuários a cada transação de
> pontos seria custoso se feito para toda micro-alteração manual. A verificação está limitada a
> aprovações de atividade (`transactionType=ACTIVITY`) — o evento mais significativo e frequente —
> comparando a posição geral antes/depois dentro da mesma transação atômica.

### `GET /api/v1/notifications`
Lista as notificações do usuário autenticado. Filtros: `isRead` (`true`/`false`), `page`, `limit`.

### `GET /api/v1/notifications/unread-count`
Contador de não lidas — `{ "count": number }`.

### `POST /api/v1/notifications/:id/read`
Marca uma notificação como lida. `403` se pertencer a outro usuário.

### `POST /api/v1/notifications/read-all`
Marca todas as notificações pendentes do usuário como lidas de uma vez.

---

## 2.13 Endpoint do Dashboard (Fase 17)

Agrega, em uma única chamada, tudo que o dashboard do participante precisa — sempre com dados
reais vindos do banco (nunca calculados/cacheados no frontend). Escopo apenas de backend nesta
fase — o projeto ainda não tem `frontend/` (decisão registrada no relatório da fase).

### `GET /api/v1/dashboard`
- **Proteção**: qualquer usuário autenticado. Sempre retorna os dados do **próprio** usuário —
  não aceita `userId` de outro (parâmetro é ignorado se enviado).
- **Query Params**: `activityLimit` (padrão 5, máx. 20) — quantidade de atividades recentes.

**Resposta:**
```json
{
  "points": { "total": 1250 },
  "ranking": { "position": 5, "totalParticipants": 42 },
  "level": {
    "current": { "id": "...", "levelNumber": 3, "name": "Competidor", "badgeIcon": "flame", "minPoints": 1000 },
    "next": { "id": "...", "name": "Destaque", "minPoints": 2500, "pointsNeeded": 1250 },
    "progress": { "current": 1250, "target": 2500 }
  },
  "recentActivities": [ /* últimas N atividades, qualquer status */ ],
  "charts": {
    "pointsEvolution": [ /* 30 pontos diários, cumulativo */ ],
    "activitiesByModality": [ /* contagem + soma de pontos por modalidade, atividades aprovadas */ ],
    "rankingEvolution": null,
    "rankingEvolutionNote": "Indisponível nesta versão: exigiria uma tabela de histórico de posições...",
    "performanceByPeriod": [ /* 8 semanas de pontos ganhos */ ]
  },
  "motivationalMessage": "🔥 Você está a apenas 80 pontos do 4º colocado!"
}
```

> **`rankingEvolution` é explicitamente `null`**, não omitido — "evolução no ranking" exigiria uma
> tabela de snapshots históricos de posição, fora do schema aprovado na Fase 1 (mesma limitação
> já documentada nas Fases 10 e 16 para "evolução"/"subida no ranking"). A chave é mantida no
> payload com uma nota explicativa, para que o consumidor da API saiba que é uma ausência
> deliberada e não um bug.

---

## 2.14 Endpoints de Perfil e Avatar (Fase 18)

Mesma decisão de escopo da Fase 17: apenas backend, sem interface visual (projeto ainda sem
`frontend/`). Presets de avatar seguem o mesmo padrão já usado em todo o projeto — um identificador
de ícone (string), renderizado pelo frontend, igual a `activityType.icon`/`level.badgeIcon`/
`achievement.icon` — não são arquivos de imagem reais.

### `GET /api/v1/profile`
Perfil completo do próprio usuário: pontos, nível/próximo nível, posição no ranking, lista de
conquistas desbloqueadas e últimas 10 atividades.

### `GET /api/v1/profile/:userId`
Perfil "público" de outro colega — mesmos dados já visíveis via `/ranking` (nome, avatar,
departamento, pontos, nível), mais `achievementsCount`. **Não** lista quais conquistas (mantém a
regra de privacidade da Fase 12) nem expõe atividades (privadas ao dono desde as Fases 6/7).

### `GET /api/v1/profile/avatar-presets`
Catálogo fixo de avatares pré-definidos (`id`, `label`, `icon`).

### `PATCH /api/v1/profile/avatar`
Define o avatar do usuário. `multipart/form-data`:
- `{ "avatarType": "INITIALS" }` — limpa o avatar (gerado a partir do nome no frontend).
- `{ "avatarType": "PRESET", "presetId": "fox" }` — seleciona um avatar do catálogo (`422
  INVALID_PRESET` se inválido).
- `{ "avatarType": "UPLOAD" }` + campo `file` (jpg/jpeg/png) — envia uma foto real, reaproveitando
  o `StorageProvider` privado das Fases 7/15.

### `GET /api/v1/profile/:userId/avatar`
Download da foto de avatar enviada (`avatarType=UPLOAD`). Diferente das evidências (Fase 7,
restritas ao dono/admin), o avatar é visível a **qualquer usuário autenticado** — mesmo padrão de
exposição que nome/avatar já têm no ranking e no mural. `404` se o usuário não tiver foto enviada.

---

## 2.15 Histórico do Usuário (Fase 19)

As duas telas de histórico pedidas pelo planejamento **já existiam**: "Meu histórico" de
atividades é `GET /api/v1/activities` (Fase 6) e o "Histórico de pontos" é
`GET /api/v1/scoring/transactions` (Fase 5), ambas já self-scoped e paginadas. O que faltava —
marcado como funcionalidade **obrigatória** — era o clique na transação para ver a origem completa.

### `GET /api/v1/scoring/transactions/:id`
Detalhe de uma transação com a origem **totalmente resolvida** conforme o tipo — não apenas a
linha flat da tabela.
- **Proteção**: dono da transação ou `ADMIN`/`ADMIN_MASTER` (`403` para os demais, `404` se
  inexistente).
- **Formato de `origin` por `transactionType`**:

| Tipo | Campos de `origin` |
|---|---|
| `ACTIVITY` | `activityId`, `activityTypeName`, `quantity`, `unit`, `activityDate`, `approvedBy` (`{id,name}`), `approvedAt` |
| `BONUS` / `PENALTY` / `ADJUSTMENT` | `grantedBy` (`{id,name}` de quem lançou) |
| `ACHIEVEMENT` | `achievementId`, `achievementName`, `description`, `icon` |
| `CHALLENGE` | `challengeId`, `challengeTitle` |
| `REWARD` | `rewardId`, `rewardTitle`, `redemptionId` |
| `REVERSAL` | `reversedTransactionId`, `reversedTransaction` (a transação original completa), `revertedBy` |

Exemplo de resposta (transação de atividade aprovada):
```json
{
  "id": "...", "points": 50, "transactionType": "ACTIVITY",
  "description": "Pontuação referente a Corrida (5 km) - Atividade #a1b2c3d4",
  "createdAt": "2026-09-01T18:32:00.000Z",
  "origin": {
    "type": "ACTIVITY", "activityTypeName": "Corrida", "quantity": 5, "unit": "km",
    "approvedBy": { "id": "...", "name": "Administrador Master" },
    "approvedAt": "2026-09-01T18:32:00.000Z"
  }
}
```

---

## 2.16 Painel Administrativo (Fase 20)

Mesma decisão de escopo das Fases 17/18 (apenas backend, sem `frontend/`). Indicadores e gráficos
agregados de todo o sistema — sempre calculados do banco, nunca em cache.

### `GET /api/v1/admin/dashboard`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- **Resposta:**
```json
{
  "indicators": {
    "totalUsers": 5, "activeUsers": 5,
    "activities": { "total": 3, "pending": 1, "approved": 2, "rejected": 0, "cancelled": 0 },
    "pendingRedemptions": 1,
    "points": { "totalDistributed": 4200, "netCirculating": 3830 },
    "topModality": { "name": "Corrida de Rua / Esteira", "approvedCount": 2 },
    "challenges": { "total": 1, "active": 1, "completedParticipations": 0 },
    "rewardsCatalogCount": 5, "totalRedemptions": 1
  },
  "topRanking": [ /* top 5 do ranking geral */ ],
  "charts": {
    "activitiesOverTime": [ /* 30 dias, aprovações por dia */ ],
    "pointsDistributedOverTime": [ /* 30 dias, só pontos positivos */ ],
    "activitiesByModality": [ /* todas as modalidades, aprovadas, desc */ ],
    "usersByDepartment": [ /* contagem por departamento */ ],
    "redemptionsByStatus": [ /* contagem por status de resgate */ ]
  }
}
```

> **`points.totalDistributed`** soma apenas transações positivas (tudo que já foi concedido, bruto).
> **`points.netCirculating`** é a soma líquida de todas as transações — sempre igual à soma de
> `users.total_points` de todo mundo, já que essa é a mesma invariante testada desde a Fase 1.

---

## 2.17 Endpoints de Regras do Jogo (Fase 21)

Diferente das Fases 17/18/20 (agregação de dados já existentes), esta fase exigiu uma tabela
**nova** — `game_rule_steps` — porque "as regras deverão vir do backend" e "não deixar textos
críticos fixos apenas no frontend" (planejamento.md §22) implica conteúdo persistido e editável
pelo admin, não apenas computado a partir de dados de outras tabelas.

### `GET /api/v1/game-rules` / `GET /api/v1/game-rules/:id`
Lista pública (sem autenticação) dos passos de "Como funciona?", ordenados por `stepNumber`.
- Um administrador **autenticado** também vê os passos `INACTIVE` (rascunhos/desativados) —
  qualquer outra pessoa só vê os `ACTIVE`.

### `POST /api/v1/game-rules` · `PATCH /api/v1/game-rules/:id` · `DELETE /api/v1/game-rules/:id`
- **Proteção**: `ADMIN` ou `ADMIN_MASTER`.
- `stepNumber` é único (`409 CONFLICT` em duplicidade).
- **Exclusão é definitiva** (diferente de Achievement/Reward/Challenge) — um passo de regras nunca
  é referenciado por `points_transactions`, então não há histórico de ledger a preservar.

> **Novo middleware**: `attachUserIfPresent` (`shared/middlewares/authMiddleware.ts`) — preenche
> `req.user` quando um token válido é enviado, mas nunca bloqueia a requisição. Usado apenas nesta
> rota pública para diferenciar a visão do admin sem exigir login de mais ninguém.

---

## 3. Endpoints de Autenticação e RBAC (Fase 3)
- `POST /api/v1/auth/login`: Login corporativo com tokens JWT.
- `GET /api/v1/auth/me`: Perfil completo do usuário logado.
- `POST /api/v1/auth/refresh`: Renovação de Access Token.
- `POST /api/v1/auth/logout`: Encerramento de sessão com auditoria.

---

## 4. Endpoints de Sistema (Fase 2)
- `GET /api/v1/health`: Healthcheck operacional e latência de banco.
- `GET /api/v1/info`: Metadados e versão da plataforma.
- `GET /api/docs`: Interface Swagger UI.
