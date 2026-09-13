# Ciclos de Premiação

## O que é

Uma competição periódica com data de início/fim e um pódio (1º/2º/3º) ao final — pense em "temporada" ou "trimestre da competição". Cadastro administrável (`AwardCycle`): nome, `startDate`/`endDate`, e opcionalmente até 3 prêmios (`CyclePrize`, um por posição do pódio — só descritivo/texto, a entrega física é externa ao sistema).

Ciclos **não podem se sobrepor no tempo** (exceto os já cancelados) — evita ambiguidade sobre qual competição vale numa data.

## Status efetivo

Mesmo princípio dos desafios: `UPCOMING`/`ACTIVE`/`COMPLETED` são derivados das datas, nunca armazenados. Diferença aqui é que existe um estado persistido `CLOSED`, alcançado só pelo encerramento automático (abaixo) — `COMPLETED` é um estado transitório (a data já passou, mas o fechamento ainda não rodou).

## Encerramento automático

Não existe um botão "encerrar ciclo". Assim que a `endDate` de um ciclo `ACTIVE` passa, o **próximo acesso** a qualquer endpoint de ciclos (ou o verificador periódico do servidor) fecha o ciclo sozinho:

1. **Calcula o pódio**: os 3 usuários ativos com mais `totalPoints` no momento (empate: ordem alfabética pelo nome). Se houver menos de 3 com pontos > 0, o pódio tem menos de 3 posições.
2. **Registra o pódio** (`CycleWinner`, imutável) e marca o ciclo `CLOSED` — feito **antes** do reset, numa transação separada, para garantir que o ciclo nunca seja reprocessado (e o pódio nunca recalculado) mesmo que a etapa 3 falhe pela metade.
3. Notifica cada colocado do pódio (`CYCLE_ENDED`, com o prêmio configurado para aquela posição, se houver).
4. **Reset geral**: todo usuário ativo com `totalPoints ≠ 0` recebe um lançamento `CYCLE_RESET` que zera o saldo — nunca por `UPDATE` direto (ver [pontuacao.md](./pontuacao.md)). Quem não ficou no pódio recebe uma notificação genérica de reset; quem ficou no pódio já recebeu a notificação da etapa 3 e não recebe uma segunda.

> **Ressalva de infraestrutura**: como hospedagens gratuitas costumam hibernar por inatividade, o fechamento de fato só roda quando o servidor está "acordado" — se ninguém acessar o sistema por um tempo após a `endDate`, o fechamento fica pendente até a próxima requisição.

## O que NUNCA é afetado pelo reset de ciclo

- O ledger de pontos (`points_transactions`) — o histórico completo permanece intacto para sempre; só o saldo corrente (`totalPoints`) volta a 0.
- Conquistas (`achievements`) — são vitalícias, nunca resetam. Mudar isso quebraria a regra de que uma conquista nunca é concedida duas vezes.
- O motor de conquistas propositalmente **não roda** durante o reset (ver [pontuacao.md](./pontuacao.md) para o motivo técnico exato).

## Edição e cancelamento

- Só um ciclo `ACTIVE` pode ser editado. As datas só podem mudar **antes** dele começar.
- `cancel`: interrompe um ciclo antes do encerramento normal — não gera pódio nem reset.
- `delete`: só permitido se o ciclo ainda nem começou; depois disso, a única forma de interromper é cancelar (preserva o registro).
