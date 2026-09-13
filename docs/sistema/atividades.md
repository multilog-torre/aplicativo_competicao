# Atividades e Modalidades

## Modalidades (`ActivityType`)

Cadastro administrável (`ADMIN`/`ADMIN_MASTER`) que define **como uma atividade pontua**. Cada modalidade tem:

- **Categoria**: `SPORTS`, `HEALTH`, `EDUCATION`, `SOCIAL`, `OTHER`.
- **Tipo de pontuação** (`scoringType`) — ver [pontuacao.md](./pontuacao.md) para a fórmula exata de cada um: `FIXED`, `QUANTITY`, `TIME`, `MULTIPLIER`.
- **`basePoints`** e **`multiplier`**: parâmetros da fórmula acima.
- **Limites** opcionais: `dailyLimit`, `weeklyLimit`, `monthlyLimit` — número máximo de atividades **aprovadas** dessa modalidade que um usuário pode ter no período. Sem limite configurado, não há restrição.
- **`requiresEvidence`**: se `true`, a atividade só pode ser aprovada com pelo menos um arquivo de evidência anexado.
- **`allowedFileTypes`**: lista de extensões aceitas para evidência daquela modalidade especificamente.
- **`status`**: `ACTIVE`/`INACTIVE` — uma modalidade inativa não aceita novos registros, mas o histórico de atividades já registradas nela continua intacto.

Excluir uma modalidade sem nenhuma atividade vinculada apaga de verdade; havendo histórico, vira soft-delete (`INACTIVE`).

## Ciclo de vida de uma atividade registrada (`UserActivity`)

```
[Participante registra] → status PENDING (pontos calculados como PREVISÃO, nada creditado ainda)
        ↓
[Participante anexa evidência, se a modalidade exigir]
        ↓
[Admin aprova]  ──────────────→  status APPROVED, pontos creditados no ledger (ver pontuacao.md)
        │
        └─ [Admin rejeita, com motivo obrigatório] → status REJECTED, nenhum ponto
```

- Ao **registrar**, o backend já calcula `calculatedPoints` (mesma fórmula da aprovação) só para exibir uma prévia — isso **não** cria transação no ledger nem altera o saldo do usuário. O crédito oficial só acontece na aprovação.
- Os limites diário/semanal/mensal da modalidade são checados **no momento do registro** (contando apenas atividades já `APPROVED` no período) — se estourado, o registro é bloqueado com 422 antes mesmo de chegar à fila do admin.
- **Evidências só podem ser enviadas enquanto a atividade está `PENDING`.** Uma vez avaliada (aprovada ou rejeitada), a lista de evidências fica congelada.
- Só o autor da atividade pode enviar evidência para ela; só o autor (ou um admin) pode visualizar os detalhes/arquivos.
- **Aprovar exige evidência já anexada, se a modalidade exigir** — mesmo que o formulário de registro tenha deixado passar, a aprovação recusa (`EVIDENCE_REQUIRED`) sem nenhuma evidência no banco.
- Uma atividade só pode ser avaliada (aprovada/rejeitada) uma única vez — tentar avaliar de novo uma que já saiu de `PENDING` retorna erro (`ACTIVITY_ALREADY_EVALUATED`).

## O que a aprovação dispara (tudo em uma única transação atômica)

1. Status → `APPROVED`, registra quem aprovou e quando.
2. Credita os pontos no ledger (`transactionType = ACTIVITY`) — ver [pontuacao.md](./pontuacao.md).
3. Reclassifica o nível do usuário, se aplicável ([niveis.md](./niveis.md)).
4. Verifica e desbloqueia conquistas, se aplicável ([conquistas.md](./conquistas.md)).
5. Atualiza o progresso de qualquer desafio ativo que case com a modalidade ([desafios.md](./desafios.md)).
6. Notifica o participante (`ACTIVITY_APPROVED`) e, se ele subiu no ranking geral por causa disso, uma segunda notificação (`RANKING_UP`).
7. Grava entrada de auditoria (`APPROVE_ACTIVITY`).

A rejeição só muda o status para `REJECTED`, grava o motivo, audita (`REJECT_ACTIVITY`) e notifica (`ACTIVITY_REJECTED`) — nenhum ponto é tocado.

## Evidências (`ActivityEvidence`)

- Armazenadas via `StorageProvider` (local em disco, ou Cloudinary em produção sem disco persistente) — o banco guarda só metadados (nome, tipo, tamanho, caminho de armazenamento), nunca o binário.
- **Nunca expostas por URL direta**: todo download passa por um endpoint autorizado que confere se quem pede é o dono da atividade ou um admin.
- Validação de extensão e tamanho máximo (`MAX_UPLOAD_SIZE_MB`) antes de salvar.

## Visibilidade

Um participante só vê e lista as próprias atividades — nunca as de outro colega (diferente do perfil, que hoje expõe atividades recentes entre colegas; ver [ranking-e-participantes.md](./ranking-e-participantes.md)). Um admin vê e filtra por qualquer usuário.
