# Pontuação

## A regra de ouro: um ledger imutável

Não existe um número "solto" de pontos em lugar nenhum. `User.totalPoints` é sempre a soma de todas as linhas da tabela `PointsTransaction` daquele usuário — nunca editado por um `UPDATE` direto. Toda entrada/saída de pontos, de qualquer origem, é uma linha nova nessa tabela (`ScoringService.creditPoints`, o único método que grava nela). Corrigir algo nunca apaga uma linha — cria uma nova que a compensa (`REVERSAL`, `CYCLE_RESET`).

Isso garante que, a qualquer momento, dá pra reconstruir exatamente de onde veio cada ponto que alguém tem — é a base da tela "Histórico" e do detalhe de cada transação (`GET /scoring/transactions/:id`, que resolve a "origem" de forma diferente por tipo).

## Fórmula de cálculo (`ScoringService.calculatePoints`)

Depende do `scoringType` configurado na modalidade ([atividades.md](./atividades.md)):

| `scoringType` | Fórmula | Exemplo |
|---|---|---|
| `FIXED` | `basePoints`, sempre — a quantidade não interfere | 1 sessão de meditação = 20 pts, seja qual for a duração informada |
| `QUANTITY` | `round(quantidade × basePoints)` | 7.5 km × 10 pts/km = 75 pts |
| `TIME` | `round(quantidade × basePoints)` (quantidade em minutos) | 30 min × 1 pt/min = 30 pts |
| `MULTIPLIER` | `round(quantidade × multiplier)` | 100 (passos) × 0.05 = 5 pts |

Esse cálculo roda **só no backend** — o frontend nunca envia `points`, apenas `activityTypeId` + `quantity`. Existe um endpoint de simulação (`POST /scoring/simulate`) que devolve o cálculo e o *breakdown* em texto sem criar nada, usado pela tela de registro para mostrar uma prévia antes de confirmar.

## Não existe pontuação por criar conta

Conferido diretamente no fluxo de cadastro: `register()`/`AdminUserService.create()` nunca definem `totalPoints` nem criam uma `PointsTransaction`. Todo usuário nasce com `totalPoints = 0`. Pontos só entram por uma das fontes da tabela abaixo.

## Os 10 tipos de transação (`transactionType`)

| Tipo | Quem/o que dispara | Sinal | Onde no código |
|---|---|---|---|
| `ACTIVITY` | Admin aprova uma atividade registrada | positivo, pela fórmula acima | `admin-activity.service.ts` (`approve`) |
| `ACHIEVEMENT` | Motor de conquistas desbloqueia uma badge automaticamente | positivo, = `pointsReward` da conquista (pode ser 0) | `achievement.service.ts` (`checkAndUnlock`) |
| `CHALLENGE` | Participante completa um desafio (bate a meta) | positivo, = `rewardPoints` do desafio | `challenge.service.ts` (`awardCompletion`) |
| `EVENT_BONUS` | Admin confirma presença do participante num evento | positivo, = `bonusPoints` do evento | `event.service.ts` (`confirmAttendance`) |
| `REWARD` | Participante resgata um prêmio do catálogo | **negativo** (débito), = `-pointsCost` | `reward.service.ts` (`redeem`) |
| `REVERSAL` | Admin desfaz uma transação anterior (erro, fraude, cancelamento de resgate) | inverte exatamente o sinal da transação original | `scoring.service.ts` (`reverseTransaction`) |
| `CYCLE_RESET` | Fechamento automático de um ciclo de premiação — zera o saldo | ajuste de zeragem (`-totalPoints` de cada um) | `cycle.service.ts` (`closeCycle`) |
| `BONUS` | Lançamento manual do admin (`POST /scoring/manual`) | positivo | `scoring.service.ts` (`manualTransaction`) |
| `PENALTY` | Lançamento manual do admin | **sempre forçado negativo** — mesmo que o admin digite um valor positivo, o código faz `-Math.abs(points)` | idem |
| `ADJUSTMENT` | Lançamento manual do admin | sinal livre (o admin decide) — correções pontuais que não são nem bônus nem punição | idem |

`BONUS`/`PENALTY`/`ADJUSTMENT` compartilham o mesmo endpoint (`POST /scoring/manual`) e são os únicos três que um admin pode escolher livremente — o schema Zod restringe a esses três valores.

## O que `creditPoints` faz, sempre, em uma única transação atômica

Toda vez que pontos entram ou saem (qualquer um dos 10 tipos acima), o mesmo método central roda estes passos, nesta ordem:

1. Cria a linha imutável em `points_transactions`.
2. Incrementa `User.totalPoints` (soma, positiva ou negativa).
3. Reclassifica o nível do usuário ([niveis.md](./niveis.md)).
4. Verifica e desbloqueia conquistas — **exceto** quando `transactionType = CYCLE_RESET** (ver nota abaixo).
5. Se for `ACTIVITY` com `activityId`: atualiza o progresso de desafios ativos.
6. Se for `ACTIVITY` com pontos positivos: verifica se a pessoa subiu no ranking geral e notifica (`RANKING_UP`).

> **Por que `CYCLE_RESET` não roda o motor de conquistas**: o reset de um ciclo passa por todos os usuários um a um, zerando cada um. No meio desse laço, alguém ainda não resetado pode aparecer transitoriamente em 1º lugar geral e desbloquear uma conquista de `RANKING_POSITION` — creditando pontos de volta bem na hora em que o saldo deveria ir a zero. Rodar o motor aqui foi avaliado como bug em potencial e desativado deliberadamente para esse tipo.

## Reversão (`REVERSAL`)

- Nunca apaga a transação original — cria uma nova com o sinal invertido, referenciando a original (`referenceId`).
- Uma transação só pode ser revertida **uma vez** (tentar de novo dá 409 `ALREADY_REVERSED`).
- Uma transação `REVERSAL` não pode ser revertida (não existe "desfazer o desfazer").
- Sempre notifica o usuário (`POINTS_ADJUSTED`) com o motivo informado pelo admin.
- Usada tanto isoladamente (admin corrige um lançamento errado) quanto internamente pelo cancelamento de resgate de prêmio ([recompensas.md](./recompensas.md)).

## Consulta e histórico

- `GET /scoring/transactions`: histórico paginado, filtrável por tipo. Participante só vê o próprio; admin filtra por qualquer usuário.
- `GET /scoring/transactions/:id`: detalhe com a **origem totalmente resolvida** — por exemplo, para uma transação `ACTIVITY` inclui o nome da modalidade, quantidade, quem aprovou e quando; para `REWARD`, o título do prêmio e o ID do resgate; para `REVERSAL`, a transação original revertida. Participante só acessa a própria; admin, qualquer uma.
