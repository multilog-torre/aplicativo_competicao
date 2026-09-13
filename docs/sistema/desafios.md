# Desafios

## Cadastro (`Challenge`)

Administrável: título, descrição, `startDate`/`endDate`, modalidade opcional (`activityTypeId` — se vazio, vale para qualquer modalidade), `targetGoal` (meta numérica, na unidade da modalidade), `rewardPoints` (crédito ao completar), `scope` (`INDIVIDUAL`/`DEPARTMENT`/`COMPANY` — hoje só afeta a visão de "progresso por departamento", a mecânica de conclusão é sempre individual) e `status`.

## Status efetivo, sempre derivado das datas

O `status` gravado só existe para permitir `CANCELLED` manual. `UPCOMING`/`ACTIVE`/`COMPLETED` **nunca são armazenados** — são calculados a cada leitura a partir de `startDate`/`endDate` comparadas com "agora", garantindo que nunca fiquem dessincronizados por esquecimento administrativo:

- `now < startDate` → `UPCOMING`
- `startDate ≤ now ≤ endDate` → `ACTIVE`
- `now > endDate` → `COMPLETED`
- (status salvo = `CANCELLED`) → sempre `CANCELLED`, independente das datas

## Participar (`join`) e progresso retroativo

Só é possível entrar (`POST /challenges/:id/join`) enquanto o desafio está `ACTIVE`. Ao entrar, o progresso **não começa do zero**: soma retroativamente toda `quantity` de atividades já aprovadas dentro do período do desafio (e da modalidade, se especificada) — quem entra em um desafio já em andamento não perde o que já fez naquele período. Se essa soma retroativa já bate a meta, o desafio é dado como concluído na hora mesmo.

Um usuário só pode participar uma vez do mesmo desafio (409 `ALREADY_JOINED` na segunda tentativa).

## Progresso incremental

Toda vez que uma atividade é aprovada (dentro da mesma transação atômica do crédito de pontos), o progresso de **todos os desafios ativos em que o usuário participa e que casam com a data/modalidade da atividade** é incrementado pela `quantity` daquela atividade. Ao cruzar a meta, o desafio é marcado concluído automaticamente — não existe um passo manual de "finalizar".

## Conclusão e recompensa

Ao completar (seja pelo cálculo retroativo do `join`, seja pelo incremento de uma nova atividade):
- Notifica o participante (`CHALLENGE_COMPLETED`).
- Se `rewardPoints > 0`, credita uma transação `CHALLENGE` no ledger e reclassifica o nível.

## Leaderboard e visão por departamento

- `GET /challenges/:id/participants`: participantes ordenados por progresso (empate: nome, ordem alfabética).
- `GET /challenges/:id/departments`: soma o progresso de todos os participantes por departamento — visão de "equipes" para desafios de escopo `DEPARTMENT`/`COMPANY`.

## Exclusão

Um desafio sem nenhum participante e sem nenhuma transação vinculada é excluído de verdade. Havendo histórico, vira `CANCELLED` — preserva o progresso e as recompensas já concedidas.
