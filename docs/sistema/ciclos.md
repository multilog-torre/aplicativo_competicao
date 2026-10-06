# Ciclos de Premiação

## O que é

Uma competição periódica com data de início/fim e um pódio (1º/2º/3º) ao final — pense em "temporada" ou "trimestre da competição". Cadastro administrável (`AwardCycle`): nome, `startDate`/`endDate`, e opcionalmente até 3 prêmios (`CyclePrize`, um por posição do pódio — só descritivo/texto, a entrega física é externa ao sistema).

Ciclos **não podem se sobrepor no tempo** (exceto os já cancelados) — evita ambiguidade sobre qual competição vale numa data. Cancelados não contam pra sobreposição; **encerrados (`CLOSED`) contam** — um ciclo já fechado ainda "ocupa calendário" pra sempre nas datas em que rodou.

## Pontuação só conta com um ciclo ativo (decisão de negócio a pedido do usuário)

Todo lançamento de pontos positivo (atividade aprovada, bônus manual, recompensa de conquista/desafio, bônus de evento) só entra no **placar de competição** (`User.totalPoints` — o número que Ranking, Nível, Dashboard e Perfil mostram) se **havia um ciclo `ACTIVE` cobrindo a data de referência daquele crédito**. Sem nenhum ciclo ativo cobrindo essa data — antes do primeiro ciclo existir, ou no intervalo entre um ciclo fechado e o próximo começar — o ganho de pontos **não conta pra nada competitivo**, mesmo que a atividade tenha sido aprovada normalmente.

**Qual é "a data de referência" (bug corrigido, relatado pelo usuário)**: pra créditos de `ACTIVITY`, é a **`activityDate`** da atividade (quando ela de fato aconteceu) — NUNCA o momento em que foi aprovada. Antes dessa correção, usava sempre "agora" (o instante da aprovação), o que causava dois problemas reais em produção: (1) uma atividade registrada em atraso ou que demorou pra ser aprovada (modalidade com evidência, fila de admin) podia ser creditada ao ciclo que por acaso estava rolando no dia da aprovação, não ao ciclo (ou à ausência de ciclo) do dia em que ela realmente ocorreu; (2) isso inflava o ciclo errado com pontos de atividades de fora do período dele. Pra `BONUS`/`PENALTY`/`ADJUSTMENT` manuais (sem atividade associada) e pra recompensas de conquista/desafio, continua sendo "agora" — não existe outra data de referência que faça sentido pra esses casos. Ver `cycleReferenceDate` em `scoring.service.ts`/`points-application.util.ts`.

- **O lançamento sempre existe no ledger** (Regra de Ouro — nunca se descarta um evento), só não é somado no placar. Fica marcado com `PointsTransaction.cycleId = null`.
- **Débitos e correções sempre aplicam**, com ou sem ciclo ativo: resgate de prêmio, `PENALTY`, e qualquer `REVERSAL` (mesmo uma reversão que devolva pontos, ex.: desfazer uma penalidade). Do contrário, um resgate feito bem no intervalo entre dois ciclos "sumiria" sem debitar de fato o saldo — uma brecha de pontos grátis. Só o GANHO NOVO (positivo, que não seja reversão) é que depende de ciclo ativo.
- **Ranking** (qualquer período — geral, semana, mês, ano) segue a mesma regra completa acima (não só "cycleId preenchido" — também inclui sempre `CYCLE_RESET` e débitos/`REVERSAL`, senão o reset nunca seria descontado do período; bug já corrigido, ver [ranking-e-participantes.md](./ranking-e-participantes.md)). O recorte `GERAL` sem filtro de modalidade nem recalcula nada — lê `User.totalPoints` direto, já que é exatamente o mesmo número.
- **Conquistas do tipo `TOTAL_POINTS`** (Centena, Clube dos 1.000, Milionário de Pontos) são a única exceção deliberada — ver `lifetimePoints` abaixo.
- Ver [pontuacao.md](./pontuacao.md) pro detalhe de implementação (`points-application.util.ts`).

### `lifetimePoints` — o contador que nunca some

Existe um segundo contador no usuário, `User.lifetimePoints`, que soma **todo** ganho/perda de pontos (positivo ou negativo) **sempre**, com ou sem ciclo ativo — a única transação que ele ignora é o próprio `CYCLE_RESET` (é só uma zeragem administrativa de placar, não uma perda real). Ele existe **só** pra sustentar as 3 conquistas `TOTAL_POINTS`, que são vitalícias por design e não deveriam depender de estar ou não dentro de um ciclo. Não aparece em nenhuma tela — é puramente um mecanismo interno (exceto no ranking, onde é a fonte do campo `totalPointsAllTime`, que hoje não tem nenhum lugar na tela que o exiba).

## Status efetivo

Mesmo princípio dos desafios: `UPCOMING`/`ACTIVE`/`COMPLETED` são derivados das datas, nunca armazenados. Diferença aqui é que existe um estado persistido `CLOSED`, alcançado só pelo encerramento automático (abaixo) — `COMPLETED` é um estado transitório (a data já passou, mas o fechamento ainda não rodou).

## Encerramento automático

Não existe um botão "encerrar ciclo". Assim que a `endDate` de um ciclo `ACTIVE` passa, o **próximo acesso** a qualquer endpoint de ciclos (ou o verificador periódico do servidor) fecha o ciclo sozinho:

1. **Calcula o pódio**: os 3 usuários ativos com mais `totalPoints` no momento. Se houver menos de 3 com pontos > 0, o pódio tem menos de 3 posições.
2. **Registra o pódio** (`CycleWinner`, imutável) e marca o ciclo `CLOSED` — feito **antes** do reset, numa transação separada, para garantir que o ciclo nunca seja reprocessado (e o pódio nunca recalculado) mesmo que a etapa 3 falhe pela metade.
3. Notifica cada colocado do pódio (`CYCLE_ENDED`, com o prêmio configurado para aquela posição, se houver).
4. **Reset geral**: todo usuário ativo com `totalPoints ≠ 0` recebe um lançamento `CYCLE_RESET` que zera o saldo — nunca por `UPDATE` direto (ver [pontuacao.md](./pontuacao.md)). Quem não ficou no pódio recebe uma notificação genérica de reset **que também cita os nomes dos 3 colocados** (ex.: "Pódio: 1º Fulano, 2º Beltrano, 3º Ciclano.") — decisão explícita para que todo mundo saiba quem ganhou, não só quem ficou no pódio. Quem ficou no pódio já recebeu a notificação pessoal da etapa 3 e não recebe uma segunda.

### Critério de desempate (pontuação exatamente igual)

**Nunca é ordem alfabética do nome** — isso decidiria arbitrariamente quem leva qual prêmio sempre que as posições tiverem prêmios diferentes (decisão revisada explicitamente com o usuário; antes da revisão o desempate era por nome). O critério é **quem chegou naquele total primeiro**: para cada candidato empatado, soma-se cronologicamente as transações de pontos dele desde o início do ciclo (`AwardCycle.startDate`) até o instante em que essa soma atingiu (ou superou) o total final — quem chegou lá mais cedo vence o empate. Só se os dois tiverem chegado no exato mesmo instante (ex.: dois lançamentos manuais em lote) é que o nome entra como último critério, puramente para garantir uma ordem determinística.

Quem não tem nenhuma transação dentro do período do ciclo (ex.: já carregava o total inteiro de antes do ciclo começar) é tratado como tendo "chegado" no início do ciclo — o melhor desempate possível para esse caso de borda, sem inventar uma data arbitrária.

> **Ressalva de infraestrutura**: como hospedagens gratuitas costumam hibernar por inatividade, o fechamento de fato só roda quando o servidor está "acordado" — se ninguém acessar o sistema por um tempo após a `endDate`, o fechamento fica pendente até a próxima requisição.

## O que NUNCA é afetado pelo reset de ciclo

- O ledger de pontos (`points_transactions`) — o histórico completo permanece intacto para sempre; só o saldo corrente (`totalPoints`) volta a 0.
- Conquistas (`achievements`) — são vitalícias, nunca resetam. Mudar isso quebraria a regra de que uma conquista nunca é concedida duas vezes.
- O motor de conquistas propositalmente **não roda** durante o reset (ver [pontuacao.md](./pontuacao.md) para o motivo técnico exato).

## Ver o próprio total de um ciclo já encerrado (Dashboard)

O Hall da Fama (abaixo) resolve "quem ganhou cada ciclo", mas não respondia "quantos pontos eu tinha quando aquele ciclo fechou" para quem não ficou no pódio — o card principal do Dashboard (`points.total`) sempre mostra o saldo **atual** (`User.totalPoints`), que já passou pelo reset.

O seletor "Ciclo de premiação" do Dashboard já existia e redireciona os gráficos para o período exato do ciclo escolhido, mas o card do topo ficava preso ao saldo atual mesmo com um ciclo passado selecionado — a pedido do usuário, passou a trocar para `points.periodTotal`: a soma de todos os lançamentos do ledger com aquele `cycleId`, ou seja, exatamente o saldo que a pessoa tinha no instante em que o ciclo fechou (o `CYCLE_RESET` seguinte nasce com `cycleId = null`, então nunca entra nessa soma — ver acima). Não exigiu nenhuma tabela nova: o dado já estava todo no ledger, só não era somado dessa forma em nenhum lugar.

`points.total` (saldo atual) continua existindo sem alteração de significado — outras partes do sistema dependem dele representar sempre o estado presente. `periodTotal` só vem preenchido quando o filtro é por `cycleId`; um intervalo de datas livre (sem ciclo específico) não altera o card, só os gráficos, porque poderia atravessar um reset no meio e produzir um número sem sentido de "saldo ao final de X" (decisão do usuário).

## Hall da Fama

Tela pública (`/hall-da-fama`, qualquer usuário autenticado — participante ou admin) que lista **todos** os ciclos já encerrados, mais recente primeiro, cada um com o pódio completo (avatar, nome, prêmio e pontos de cada colocado). Reaproveita o mesmo `GET /cycles` já público usado internamente — não é um endpoint novo, é a mesma leitura que a tela "Ver pódio" de Admin > Ciclos já usava, só que numa página própria e sem exigir papel de admin.

Antes desta tela existir, o único jeito de ver o pódio de um ciclo já encerrado era a tela "Ver pódio" dentro de Admin > Ciclos de Premiação — exclusiva de `ADMIN`/`ADMIN_MASTER`. Um participante só sabia da própria colocação pela notificação pessoal, e não tinha como conferir o pódio depois ou ver quem ganhou se não estivesse nele. O Hall da Fama existe justamente para preencher essa lacuna.

## Edição e cancelamento

- Só um ciclo `ACTIVE` pode ser editado.
- **Antes do ciclo começar**: `startDate`/`endDate` mudam livremente (respeitando não-sobreposição com outros ciclos).
- **Depois que o ciclo já começou**: `endDate` continua travado (adiantar ou atrasar o fechamento de um ciclo em andamento mexeria com pódio/reset já "agendados" pela data). `startDate` tem uma exceção: pode ser **antecipada** (movida pra uma data **anterior** à atual), nunca adiada — a pedido do usuário, pra "resgatar" atividades que já aconteceram antes do ciclo começar oficialmente mas que deveriam contar pra ele (ex.: ciclo criado com atraso em relação ao anterior, deixando um intervalo sem cobertura). Mover a data de início pra trás só AMPLIA a janela do ciclo, nunca reduz o que já foi creditado a ele — diferente de adiar, que excluiria retroativamente créditos já contabilizados.
  - **O que essa antecipação NÃO faz sozinha**: não retroage em nada já lançado no ledger. Uma atividade que, numa data agora coberta pela janela ampliada, já tinha sido aprovada e creditada com `cycleId = null` (porque não havia ciclo ativo cobrindo ela na época) **continua com `cycleId = null`** — o `cycleId` de uma transação é gravado uma única vez, no momento do crédito (ver "Pontuação só conta com um ciclo ativo" acima), e nunca é reescrito depois. A antecipação da data só muda o comportamento **daqui pra frente**: créditos novos (ex.: aprovar agora uma atividade pendente cuja `activityDate` cai dentro da janela ampliada) passam a contar pro ciclo corretamente. Pra uma atividade específica que já foi aprovada com o `cycleId` errado antes da correção de data, é preciso uma correção manual pontual (reversão + reconferência), não existe recálculo em massa automático.
- `cancel`: interrompe um ciclo antes do encerramento normal — não gera pódio nem reset.
- `delete`: só permitido se o ciclo ainda nem começou; depois disso, a única forma de interromper é cancelar (preserva o registro).
