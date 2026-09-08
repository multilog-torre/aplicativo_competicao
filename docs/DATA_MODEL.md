# Modelo de Dados — Sistema Corporativo de Gamificação

## Entidades Principais

### 1. Usuários e Acesso
- `users`: Usuários do sistema (participantes e administradores).
- `departments`: Departamentos corporativos (TI, Vendas, RH, etc.).
- `roles`: Papéis de acesso (`PARTICIPANTE`, `ADMIN`, `ADMIN_MASTER`).
- `permissions`: Permissões granulares de sistema.
- `user_roles`: Relacionamento N:N entre usuários e papéis.
- `role_permissions`: Relacionamento N:N entre papéis e permissões.

### 2. Modalidades e Atividades
- `activity_types`: Modalidades dinâmicas (Academia, Corrida, Leitura, etc.).
  - Tipos de cálculo: `FIXED`, `QUANTITY`, `TIME`, `MULTIPLIER`.
- `user_activities`: Registros de atividades submetidas pelos usuários.
  - Status: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`.
- `activity_evidence`: Metadados das comprovações/arquivos anexados.

### 3. Ledger de Pontuação e Auditoria
- `points_transactions`: Histórico imutável de todas as movimentações de pontos.
  - Tipos: `ACTIVITY`, `BONUS`, `PENALTY`, `ADJUSTMENT`, `CHALLENGE`, `ACHIEVEMENT`, `REWARD`, `REVERSAL`.
- `audit_logs`: Trilha de auditoria das ações administrativas e operações críticas.

### 4. Gamificação, Social e Engajamento
- `levels`: Tabela de progressão de níveis por faixas de pontuação.
- `achievements`: Conquistas e badges desbloqueáveis por regras.
- `user_achievements`: Conquistas adquiridas por usuário.
- `challenges`: Desafios periódicos individuais ou departamentais.
- `challenge_participants`: Participação e progresso em desafios.
- `rewards`: Catálogo de prêmios corporativos.
- `user_rewards`: Resgates e premiações concedidas.
- `posts`, `comments`, `post_likes`: Mural social corporativo.
- `notifications`: Notificações in-app disparadas por eventos do sistema.
