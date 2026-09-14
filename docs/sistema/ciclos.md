# Ciclos de Premiação

## O que é

Uma competição periódica com data de início/fim e um pódio (1º/2º/3º) ao final — pense em "temporada" ou "trimestre da competição". Cadastro administrável (`AwardCycle`): nome, `startDate`/`endDate`, e opcionalmente até 3 prêmios (`CyclePrize`, um por posição do pódio — só descritivo/texto, a entrega física é externa ao sistema).

Ciclos **não podem se sobrepor no tempo** (exceto os já cancelados) — evita ambiguidade sobre qual competição vale numa data.

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

## Hall da Fama

Tela pública (`/hall-da-fama`, qualquer usuário autenticado — participante ou admin) que lista **todos** os ciclos já encerrados, mais recente primeiro, cada um com o pódio completo (avatar, nome, prêmio e pontos de cada colocado). Reaproveita o mesmo `GET /cycles` já público usado internamente — não é um endpoint novo, é a mesma leitura que a tela "Ver pódio" de Admin > Ciclos já usava, só que numa página própria e sem exigir papel de admin.

Antes desta tela existir, o único jeito de ver o pódio de um ciclo já encerrado era a tela "Ver pódio" dentro de Admin > Ciclos de Premiação — exclusiva de `ADMIN`/`ADMIN_MASTER`. Um participante só sabia da própria colocação pela notificação pessoal, e não tinha como conferir o pódio depois ou ver quem ganhou se não estivesse nele. O Hall da Fama existe justamente para preencher essa lacuna.

## Edição e cancelamento

- Só um ciclo `ACTIVE` pode ser editado. As datas só podem mudar **antes** dele começar.
- `cancel`: interrompe um ciclo antes do encerramento normal — não gera pódio nem reset.
- `delete`: só permitido se o ciclo ainda nem começou; depois disso, a única forma de interromper é cancelar (preserva o registro).
