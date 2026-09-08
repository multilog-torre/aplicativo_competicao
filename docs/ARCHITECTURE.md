# Documento de Arquitetura — Sistema Corporativo de Gamificação

## 1. Visão Geral
A plataforma foi concebida para engajar colaboradores em desafios e competições corporativas através de mecânicas de gamificação.

---

## 2. Princípios Arquiteturais Inegociáveis

1. **Backend como Única Fonte da Verdade**:
   - O frontend nunca calcula ou decide pontuações, aprovações ou rankings.
   - Toda validação de limites (diário, semanal, mensal) e cálculo de multiplicador é executada no backend.
2. **Ledger Imutável de Transações de Pontos (`points_transactions`)**:
   - Proibido `UPDATE` ou `DELETE` direto em pontos registrados.
   - Correções exigem lançamentos compensatórios de `REVERSAL` ou `ADJUSTMENT` com auditoria completa.
3. **Atomicidade e Transações ACID**:
   - Ações de aprovação, atribuição de pontos, verificação de badges e atualização de nível acontecem dentro de uma mesma transação no PostgreSQL (`prisma.$transaction`).
4. **Armazenamento de Arquivos Desacoplado**:
   - Binários de imagens/documentos são armazenados em provedores de Storage (Local/Azure/S3).
   - O PostgreSQL armazena apenas metadados (`activity_evidence`) e o acesso é estritamente controlado.
5. **Rastreabilidade e Auditoria (`audit_logs`)**:
   - Todas as operações administrativas geram registros de auditoria imutáveis.

---

## 3. Fluxos de Negócio

### Fluxo de Registro e Aprovação de Atividades
```text
[Usuário] Registra Atividade + Anexa Evidência
    ↓ (Status: PENDING)
[Backend] Valida limites, calcula pontuação teórica e persiste
    ↓
[Painel Admin] Gestor visualiza atividade e evidência anexada
    ↓
[Aprovação Atômica - DB Transaction]:
    1. user_activities status -> APPROVED
    2. Insere points_transactions (+X pontos, tipo ACTIVITY)
    3. Atualiza pontuação consolidada do usuário
    4. Avalia subida de Nível (levels)
    5. Avalia desbloqueio de Conquistas (achievements)
    6. Atualiza progresso em Desafios ativos (challenges)
    7. Dispara Notificação ao usuário
    8. Registra Audit Log
```
