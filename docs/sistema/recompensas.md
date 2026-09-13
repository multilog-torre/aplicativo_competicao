# Recompensas (Catálogo de Prêmios)

## Catálogo (`Reward`)

Administrável: título, descrição, imagem, `pointsCost`, `quantityAvailable`, `status` (`AVAILABLE`/`OUT_OF_STOCK`/`INACTIVE`). A listagem pública, por padrão, esconde prêmios `INACTIVE` (retirados de linha) — um admin pode listar explicitamente por status.

Excluir um prêmio nunca resgatado apaga de verdade; havendo qualquer resgate no histórico, vira `INACTIVE` (soft delete) — preserva a integridade dos resgates já feitos.

## Resgate (`redeem`)

Debita os pontos do usuário através do **mesmo motor de pontuação oficial** (`ScoringService.creditPoints`, `transactionType = REWARD`, valor negativo) — não é um débito "especial", é o mesmo caminho de qualquer outra transação, o que garante que nível e conquistas sejam reavaliados consistentemente também para débitos.

Condições checadas antes de permitir:
- Prêmio precisa estar `AVAILABLE` (nunca `OUT_OF_STOCK`/`INACTIVE`).
- Precisa haver estoque (`quantityAvailable > 0`).
- O usuário precisa ter pontos suficientes (`totalPoints ≥ pointsCost`).

Ao resgatar, uma unidade é debitada do estoque; se o estoque zerar, o prêmio muda automaticamente para `OUT_OF_STOCK` (fica invisível no catálogo público até repor ou até um cancelamento devolver uma unidade).

## Ciclo de vida do resgate (`UserReward`)

```
REQUESTED  (resgate feito, pontos já debitados)
    ↓
APPROVED   (admin aprova — prêmio "em preparação")
    ↓
DELIVERED  (admin marca como entregue)
```

Em `REQUESTED` ou `APPROVED`, o admin também pode **cancelar** (nunca depois de `DELIVERED`). Cada transição notifica o usuário (`REWARD_UPDATE`) e é auditada.

## Cancelamento e estorno

Cancelar um resgate:
1. Estorna os pontos ao usuário — não por um novo débito manual, mas através de uma `REVERSAL` da transação `REWARD` original (ver [pontuacao.md](./pontuacao.md)), que já cuida de notificar o estorno com o motivo.
2. Devolve 1 unidade ao estoque, reativando o prêmio (`AVAILABLE`) se ele estava `OUT_OF_STOCK`.
3. Marca o resgate `CANCELLED`.

Um resgate já `DELIVERED` nunca pode ser cancelado (o prêmio físico já saiu de circulação). Um resgate já `CANCELLED` não pode ser cancelado de novo.

## Visibilidade

Um participante só vê os próprios resgates; um admin filtra por qualquer usuário e vê a fila completa (útil para a tela de aprovação/entrega).
