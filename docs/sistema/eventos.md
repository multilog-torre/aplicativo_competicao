# Eventos Comunitários

## O que é

Um evento presencial (corrida, aula coletiva de academia, etc.) que **qualquer usuário autenticado pode propor** — não é exclusivo de admin. Categorias fixas: `CORRIDA`, `CAMINHADA`, `CICLISMO`, `ACADEMIA`, `ESPORTE_COLETIVO`, `OUTRO` (lista própria, não reaproveita o cadastro de Modalidades de atividade).

## Ciclo de vida

```
[Qualquer usuário propõe] → PENDING (sem pontuação de bônus definida ainda)
        ↓
[Admin aprova, definindo bonusPoints] → APPROVED (abre para inscrições)
   ou
[Admin rejeita, com motivo] → REJECTED
        ↓ (chegou a data do evento)
[Admin confirma quem compareceu] → COMPLETED (bônus creditado só a quem compareceu)

Em qualquer ponto antes de COMPLETED: [Admin cancela] → CANCELLED
```

**Regra de ouro aplicada aqui**: quem propõe o evento nunca escolhe a própria pontuação — o `bonusPoints` só é definido pelo admin, só no momento da aprovação (ou depois, editando um evento já `APPROVED`), nunca pelo criador.

## Quem vê o quê

- Eventos `APPROVED`/`COMPLETED`: visíveis a qualquer autenticado.
- Eventos `PENDING`/`REJECTED`/`CANCELLED`: visíveis só para o criador e para admins.
- `?mine=true`: atalho para "eventos que eu criei". `?participating=true`: atalho para "eventos em que estou inscrito" (usado pelas abas de grupo do Mural).

## Edição

Permitida pelo criador **ou** por um admin, só enquanto o evento ainda não aconteceu e não está `COMPLETED`/`CANCELLED`/`REJECTED` (depois disso os dados já viraram histórico — pódio de presença, ledger — e não podem mudar). Se a data mudar, todo inscrito é notificado (`EVENT_UPDATED`).

## Inscrição e saída

- `join`: só em evento `APPROVED` e cuja data ainda não passou. Não pode se inscrever duas vezes.
- `leave`: pode sair a qualquer momento, mesmo depois do evento já ter acontecido — nunca desfaz um bônus já creditado (o ledger é imutável), só remove a inscrição e, com ela, o acesso ao grupo de discussão daquele evento no Mural. Sair antes do admin confirmar presença equivale a não ter comparecido.
- A lista de participantes de um evento é **pública a qualquer autenticado** (decisão deliberada: "quero que fique visível quem está participando"), não restrita a admins.

## Confirmação de presença e crédito do bônus

Só possível para um evento `APPROVED`, com `bonusPoints` definido, e **depois** que a data do evento já passou. O admin informa a lista de quem compareceu; todos os demais inscritos viram `NO_SHOW` automaticamente. Isso trava o evento em `COMPLETED` (nunca reprocessável) **antes** de qualquer crédito de ponto — se o crédito falhar pela metade, o evento não fica em estado ambíguo. Só quem tem status `ATTENDED` recebe a transação `EVENT_BONUS` no ledger e a notificação correspondente.

## Cancelamento

Um evento `PENDING` ou `APPROVED` pode ser cancelado a qualquer momento antes de `COMPLETED`. Todo inscrito é notificado (`EVENT_REJECTED` é reaproveitado como tipo de notificação para esse caso).

## Exclusão

Só o próprio criador pode excluir, e só enquanto o evento está `PENDING` (ninguém inscrito ainda) — depois disso a única forma de interromper é cancelar.
