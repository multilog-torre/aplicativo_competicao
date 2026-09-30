# Pontuação

## A regra de ouro: um ledger imutável

Não existe um número "solto" de pontos em lugar nenhum. Toda entrada/saída de pontos, de qualquer origem, é uma linha nova na tabela `PointsTransaction` — nunca um `UPDATE` direto em qualquer contador. Corrigir algo nunca apaga uma linha — cria uma nova que a compensa (`REVERSAL`, `CYCLE_RESET`).

Isso garante que, a qualquer momento, dá pra reconstruir exatamente de onde veio cada ponto que alguém tem — é a base da tela "Histórico" e do detalhe de cada transação (`GET /scoring/transactions/:id`, que resolve a "origem" de forma diferente por tipo).

## Dois contadores, dois propósitos (desde a pontuação por ciclo)

O `User` guarda **dois** agregados, cada um com uma regra de soma diferente (`points-application.util.ts`, chamado por todo lugar que credita/debita pontos):

| Campo | O que é | Quando soma |
|---|---|---|
| `totalPoints` | O "placar de competição" — o que Ranking, Nível, Dashboard e Perfil mostram | Só ganhos NOVOS (positivos) gerados com um ciclo de premiação `ACTIVE` no momento; débitos/correções (`REVERSAL`, valores negativos) sempre somam; `CYCLE_RESET` sempre zera |
| `lifetimePoints` | Marco vitalício, nunca afetado por ciclo | Sempre, com ou sem ciclo ativo — exceto o próprio `CYCLE_RESET` |

**Por quê**: decisão de negócio a pedido do usuário — pontos ganhos sem nenhum ciclo de premiação rolando (antes do primeiro ciclo, ou no intervalo entre um ciclo fechado e o próximo começar) não devem contar pra competição, mas o histórico completo (ledger + `lifetimePoints`) nunca perde nada. Ver [ciclos.md](./ciclos.md) para o detalhe completo dessa regra, incluindo por que débitos sempre aplicam (evita uma brecha de "resgate grátis" no intervalo entre ciclos).

`lifetimePoints` tem uma única finalidade hoje: sustentar as conquistas `TOTAL_POINTS` (Centena, Clube dos 1.000, Milionário de Pontos) como marcos vitalícios de verdade, imunes tanto a `CYCLE_RESET` quanto a essa nova regra de "sem ciclo, não conta".

Cada `PointsTransaction` também carrega um `cycleId` (nulo se não havia ciclo ativo no momento) — é o que permite ao Ranking recalcular a soma "oficial" direto do ledger (sem confiar só na coluna `totalPoints`) já respeitando a mesma regra.

## Fórmula de cálculo (`ScoringService.calculatePoints`)

Depende do `scoringType` configurado na modalidade ([atividades.md](./atividades.md)):

| `scoringType` | Fórmula | Exemplo |
|---|---|---|
| `FIXED` | `basePoints`, sempre — a quantidade não interfere | 1 sessão de meditação = 12 pts, seja qual for a duração informada |
| `QUANTITY` | `round(quantidade × basePoints)` | 7.5 km de corrida × 6 pts/km = 45 pts |
| `TIME` | `round(quantidade × basePoints)` (quantidade em minutos) — nenhuma modalidade usa hoje, ver nota abaixo | 30 min × 1 pt/min = 30 pts |
| `MULTIPLIER` | `round(quantidade × multiplier)` — usado quando a taxa por unidade precisa ser decimal (`basePoints` é `Int`, `multiplier` é `Float`) | 30 minutos de curso × 0,4 = 12 pts |

`TIME` existe no schema mas está **sem uso** — Curso e Eventos/Palestras, que são "por minuto", usam `MULTIPLIER` (não `TIME`) justamente porque a taxa (0,4 pt/min) é decimal e `TIME` também exigiria um `basePoints` inteiro. Ver "Recalibragem por hora de esforço equivalente" abaixo.

## Recalibragem por hora de esforço equivalente (modalidades)

A pedido do usuário, todas as modalidades foram recalibradas numa régua comum — **pontos por hora de esforço/tempo real investido** — usando Academia (20 pts/sessão ≈ 50min ≈ 24 pts/hora) como âncora. Antes, modalidades de valor fixo alto (Eventos/Palestras a 250 pts fixos, Curso a 100-150 pts fixos) rendiam de 5x a 50x mais por hora que qualquer atividade física, e Leitura (0,1 pt/página) rendia ~3 pts/hora — uma fração do resto.

| Modalidade | `scoringType` | Valor | ≈ pts/hora |
|---|---|---|---|
| Academia & Musculação | FIXED | 20 pts/sessão | ~24 (âncora) |
| Esportes | FIXED | 30 pts/realização | ~24 |
| Meditação & Mindfulness | FIXED | 12 pts/sessão | ~36-48 |
| Corrida de Rua/Esteira | QUANTITY | 6 pts/km | ~54 (a 9km/h) |
| Ciclismo | QUANTITY | 3 pts/km | ~54 (a 18km/h) |
| Caminhada | QUANTITY | 4 pts/km | ~20 (a 5km/h) |
| Leitura de Livros | MULTIPLIER | 0,3 pt/página | ~9 |
| **Curso** | MULTIPLIER | **0,4 pt/minuto** | 24 (fixo — é literalmente por hora) |
| **Eventos/Palestras** | MULTIPLIER | **0,4 pt/minuto** | 24 (fixo — é literalmente por hora) |

Curso e Eventos/Palestras deixaram de ser um valor fixo por registro (que tratava um evento de 30 minutos igual a um de 8 horas) e passaram a ser por **minuto** — precedente real: o modelo de crédito profissional PMI PDU/CEU (1 hora = 1 unidade de crédito, proporcional linear, sem degrau entre uma sessão de 30 e 45 minutos). A pessoa registra os minutos de uma sessão de estudo/participação, ou o total de uma vez ao concluir — as duas formas funcionam igual, e não há limite diário que impeça registros parciais.

Essa recalibragem também obrigou a recalcular os limiares de nível (ver [niveis.md](./niveis.md)) — o teto de pontos atingível num ciclo caiu bastante ao cortar o valor fixo alto de Eventos/Palestras, então os 5 níveis foram redistribuídos por simulação de perfis de participante (sedentário a extremo) ao longo de um ciclo de ~3 meses.

Esse cálculo roda **só no backend** — o frontend nunca envia `points`, apenas `activityTypeId` + `quantity`. Existe um endpoint de simulação (`POST /scoring/simulate`) que devolve o cálculo e o *breakdown* em texto sem criar nada, usado pela tela de registro para mostrar uma prévia antes de confirmar.

## Não existe pontuação por criar conta

Conferido diretamente no fluxo de cadastro: `register()`/`AdminUserService.create()` nunca definem `totalPoints` nem criam uma `PointsTransaction`. Todo usuário nasce com `totalPoints = 0`. Pontos só entram por uma das fontes da tabela abaixo.

## Os 10 tipos de transação (`transactionType`)

| Tipo | Quem/o que dispara | Sinal | Onde no código |
|---|---|---|---|
| `ACTIVITY` | Admin aprova uma atividade registrada | positivo, pela fórmula acima | `admin-activity.service.ts` (`approve`) |
| `ACHIEVEMENT` | Motor de conquistas desbloqueia uma badge automaticamente | positivo, = `pointsReward` da conquista (pode ser 0) | `achievement.service.ts` (`checkAndUnlock`) — não passa por `creditPoints`, mas aplica a mesma regra de ciclo via `points-application.util.ts` diretamente |
| `CHALLENGE` | Participante completa um desafio (bate a meta) | positivo, = `rewardPoints` do desafio | `challenge.service.ts` (`awardCompletion`) — idem, mesma regra aplicada diretamente |
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

1. Descobre se há um ciclo de premiação `ACTIVE` agora (`getActiveCycleId`) e grava esse `cycleId` (ou `null`) na própria transação.
2. Cria a linha imutável em `points_transactions`.
3. Aplica o valor em `User.totalPoints`/`User.lifetimePoints` conforme a regra da seção acima (`applyPointsToUser`).
4. Reclassifica o nível do usuário ([niveis.md](./niveis.md)) — sempre com base no `totalPoints` já atualizado, então também respeita a regra de ciclo automaticamente.
5. Verifica e desbloqueia conquistas — **exceto** quando `transactionType = CYCLE_RESET** (ver nota abaixo).
6. Se for `ACTIVITY` com `activityId`: atualiza o progresso de desafios ativos.
7. Se for `ACTIVITY` com pontos positivos: verifica se a pessoa subiu no ranking geral e notifica (`RANKING_UP`).

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
