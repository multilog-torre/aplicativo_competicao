# Dicionário do Banco de Dados — Sistema Corporativo de Gamificação

## Visão Geral do Schema
O banco de dados foi construído com suporte oficial a PostgreSQL (Prisma ORM) com integridade referencial, foreign keys, constraints e histórico de ledger imutável de transações.

---

## 0. Fonte de Verdade e Migrations

- **`prisma/schema.prisma` (PostgreSQL) é a única fonte de verdade do modelo de dados.**
- **`prisma/schema.sqlite.prisma` é um arquivo GERADO** por `npm run db:sqlite:sync` a partir do
  schema canônico. Existe apenas como conveniência para desenvolvimento local em máquinas sem
  Docker/PostgreSQL e **nunca deve ser editado manualmente**.
- As migrations versionadas ficam em `prisma/migrations/`. A migration inicial
  (`20260904000000_init`) cria as 21 tabelas com todos os índices e foreign keys.

### Subir o banco do zero (PostgreSQL — caminho oficial)
```bash
docker compose up -d postgres     # sobe o PostgreSQL 16
cd backend
npm run db:setup                  # migrate deploy + generate + seed
npm run prisma:migrate:status     # confere se está em dia
```

### Criar uma nova migration após alterar o schema
```bash
cd backend
npm run prisma:migrate -- --name descricao_da_mudanca
npm run db:sqlite:sync            # mantém o schema SQLite derivado em sincronia
```

### Alternativa local sem Docker (SQLite)
```bash
cd backend
npm run db:setup:sqlite
```

---

## 1. Mapeamento de Tabelas e Campos

### 1.1 `users`
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK, Default UUID | Identificador único do usuário |
| `corporate_id` | String | Unique, Nullable | Matrícula corporativa do colaborador |
| `email` | String | Unique, Not Null | E-mail corporativo para login |
| `name` | String | Not Null | Nome completo do usuário |
| `password_hash` | String | Nullable | Hash seguro bcrypt da senha (quando auth local) |
| `department_id` | UUID | FK -> `departments.id` | Departamento do usuário |
| `position` | String | Nullable | Cargo corporativo |
| `avatar_type` | String | Default 'INITIALS' | Tipo de avatar (`INITIALS`, `PRESET`, `UPLOAD`) |
| `avatar_url` | String | Nullable | URL da foto do avatar |
| `status` | String | Default 'ACTIVE' | Status da conta (`ACTIVE`, `INACTIVE`, `SUSPENDED`) |
| `total_points` | Int | Default 0 | Saldo consolidado de pontos acumulados |
| `level_id` | UUID | FK -> `levels.id` | Nível atual do usuário |
| `created_at` | DateTime | Default NOW | Data de cadastro |
| `updated_at` | DateTime | Auto-update | Data da última atualização |

### 1.2 `departments`
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único |
| `name` | String | Unique, Not Null | Nome do departamento |
| `description` | String | Nullable | Descrição das atividades do setor |
| `status` | String | Default 'ACTIVE' | Status do departamento |

### 1.3 `roles`, `permissions`, `user_roles`, `role_permissions`
- Perfis padrão: `PARTICIPANTE`, `ADMIN`, `ADMIN_MASTER`.
- Tabela associativa `user_roles` com chave composta `(user_id, role_id)`.
- Tabela associativa `role_permissions` com chave composta `(role_id, permission_id)`.

### 1.4 `activity_types` (Modalidades Dinâmicas)
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único da modalidade |
| `name` | String | Unique, Not Null | Nome da modalidade (ex: Corrida, Academia) |
| `category` | String | Default 'SPORTS' | Categoria (`SPORTS`, `HEALTH`, `EDUCATION`, `SOCIAL`) |
| `scoring_type` | String | Default 'FIXED' | Forma de cálculo (`FIXED`, `QUANTITY`, `TIME`, `MULTIPLIER`) |
| `base_points` | Int | Default 10 | Pontuação base da modalidade |
| `unit` | String | Nullable | Unidade de medida (ex: `km`, `min`, `livro`, `treino`) |
| `multiplier` | Float | Default 1.0 | Multiplicador de pontos por unidade |
| `daily_limit` | Int | Nullable | Teto máximo de pontos/atividades por dia |
| `requires_evidence` | Boolean | Default true | Se exige upload de foto/comprovante |
| `allowed_file_types` | String | Default 'jpg,jpeg,png,pdf' | Extensões permitidas |

### 1.5 `user_activities` (Atividades Submetidas)
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único da atividade |
| `user_id` | UUID | FK -> `users.id` | Autor da atividade |
| `activity_type_id` | UUID | FK -> `activity_types.id` | Modalidade praticada |
| `activity_date` | DateTime | Not Null | Data de realização da atividade |
| `quantity` | Float | Default 1 | Quantidade realizada (ex: 5.5 km) |
| `unit` | String | Nullable | Unidade no momento do registro |
| `calculated_points` | Int | Not Null | Pontos calculados pelo backend |
| `status` | String | Default 'PENDING' | Status (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) |
| `validated_at` | DateTime | Nullable | Data/hora da validação pelo gestor |
| `validated_by` | UUID | FK -> `users.id` | Administrador que aprovou/rejeitou |
| `rejection_reason` | String | Nullable | Justificativa obrigatória em caso de rejeição |

### 1.6 `activity_evidence` (Metadados de Evidências)
- `id`, `activity_id` (FK), `file_name`, `file_type`, `file_size`, `storage_provider`, `storage_path`, `storage_url`, `uploaded_by`.

### 1.7 `points_transactions` (Ledger Imutável de Pontos)
- **Regra Fundamental**: Transações de pontos nunca são apagadas ou zeradas diretamente.
- Tipos de transação suportados:
  - `ACTIVITY`: Pontos creditados por aprovação de atividade física/cultural.
  - `BONUS`: Bônus corporativo concedido por administrador.
  - `PENALTY`: Penalidade aplicada por descumprimento de regra.
  - `ADJUSTMENT`: Ajuste manual de correção documentado.
  - `CHALLENGE`: Recompensa por meta batida em desafio.
  - `ACHIEVEMENT`: Desbloqueio automático de conquista/badge.
  - `REWARD`: Débito por resgate de prêmio no catálogo.
  - `REVERSAL`: Estorno rastreável de pontuação anterior.

### 1.8 `levels`, `achievements`, `user_achievements`, `challenges`, `challenge_participants`
- Estrutura completa de gamificação, faixas de experiência e metas individuais/coletivas.

### 1.9 `rewards`, `user_rewards`
- Catálogo de prêmios corporativos e histórico de resgates.

### 1.10 `posts`, `comments`, `post_likes`, `notifications`, `audit_logs`
- Mural social interativo, feed de notificações e trilha de auditoria completa.

### 1.11 `game_rule_steps` (Fase 21 — tabela adicionada após o schema inicial da Fase 1)
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | UUID | PK | Identificador único do passo |
| `step_number` | Int | Unique, Not Null | Ordem de exibição (1, 2, 3...) |
| `title` | String | Not Null | Título curto do passo |
| `description` | String | Not Null | Texto explicativo, configurável pelo admin |
| `icon` | String | Default 'info' | Ícone (mesmo padrão de `level.badge_icon`/`achievement.icon`) |
| `status` | String | Default 'ACTIVE' | `ACTIVE` (visível ao público) / `INACTIVE` (só admin vê) |

Migration: `prisma/migrations/20260908000000_add_game_rule_steps/`. Sem foreign keys — nenhuma
outra tabela referencia `game_rule_steps`, por isso a exclusão é sempre definitiva (não há
histórico de ledger a preservar, diferente de Achievement/Reward/Challenge).
