# Painel Administrativo (Painel Geral)

## O que é

Tela consolidada de indicadores e gráficos (`GET /admin/dashboard`) — aberta a **qualquer usuário autenticado**, não só admin (decisão deliberada: "visão consolidada aberta a todos"). Tudo é calculado na hora, direto do banco — nunca em cache.

## Dois grupos, duas regras de filtro diferentes

A tela tem um filtro (data, ciclo de premiação, usuário, departamento, modalidade — a gaveta de filtros no topo). Ele **não afeta tudo igual**:

### Indicadores (`indicators`, os cartões do topo)

A maioria é sempre **"ao vivo"**, sem filtro nenhum — retrato geral e atual da empresa, independente do que estiver selecionado na gaveta:

- `totalUsers` — nunca filtra.
- `activeUsers` ("Colaboradores") — nunca filtra, sempre o headcount total de usuários `ACTIVE` da empresa, independente de ciclo/data/departamento/etc. (decisão explícita do usuário — uma versão anterior desta mudança fazia esse cartão virar "quem participou no período" quando filtrado; foi revertido de propósito, pra esse número nunca depender do filtro escolhido).
- `points.netCirculating` (saldo líquido em circulação, usado no texto do banner motivacional) — nunca filtra.
- `topModality`, `challenges`, `rewardsCatalogCount`, `totalRedemptions`, `pendingRedemptions` — nunca filtram.

**Três cartões são exceção** (a pedido explícito do usuário, revertendo parcialmente a decisão original de "cartões nunca filtram") — **passam a refletir o filtro quando ele está ativo**:

| Cartão | Sem filtro | Com filtro ativo |
|---|---|---|
| **Pontos distribuídos** (`points.totalDistributed`) | Soma de todo ponto positivo já concedido, desde sempre | Soma só dentro do recorte filtrado |
| **Atividades pendentes** (`activities.pending`) | Toda atividade `PENDING` que existe | Só as `PENDING` cujo **`createdAt`** (data de registro — não têm `validatedAt` ainda) cai dentro do recorte |
| **Aprovadas hoje** (`activities.approvedToday`) | Literalmente "hoje" (aprovadas desde a meia-noite de Brasília) | Aprovadas dentro do recorte filtrado (deixa de ser "hoje" de verdade) — **o rótulo do cartão muda pra "Aprovadas no período"** nesse caso, calculado no frontend a partir de "algum filtro está ativo?", não um campo novo da API |

**"Filtro ativo" aqui significa**: `dateFrom`/`dateTo`/`cycleId`/`userId`/`departmentId`/`activityTypeId` — qualquer um desses preenchido já conta. `cycleId` é só um atalho que o backend resolve pro `dateFrom`/`dateTo` exato daquele ciclo antes de aplicar as regras acima (ver `resolveFilters` em `admin-dashboard.service.ts`) — por isso escolher um ciclo no filtro tem exatamente o mesmo efeito que digitar as datas dele manualmente.

`total`, `approved`, `rejected`, `cancelled` (os outros campos de `indicators.activities`) continuam sempre gerais, sem filtro — só `pending` e `approvedToday` mudam.

### Gráficos (`charts`)

Sempre respeitaram o filtro (não é novidade desta mudança): `activitiesOverTime`, `pointsHistory`, `activitiesByModality`/`topActivities`, `topUsersEvolution`, `modalityHighlights`. Sem filtro, cada um usa sua própria janela padrão (últimos 30 dias, 12 meses, etc. — varia por gráfico, documentado no próprio código). `usersByDepartment` e `redemptionsByStatus` são exceção: nunca filtram, são sempre uma foto do presente.

## `GET /cycles/current`

Endpoint separado (não faz parte do payload de `/admin/dashboard`) que devolve o ciclo `ACTIVE` agora, ou `null`. Alimenta o card "🏁 Ciclo Atual" no topo do painel — mesma lógica de "ciclo ativo" usada pela regra de pontuação por ciclo ([ciclos.md](./ciclos.md)).
