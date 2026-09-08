# Sistema Corporativo de Competição e Gamificação

Plataforma corporativa web para engajamento, competições esportivas/culturais e gamificação de equipes corporativas.

---

## 🏗️ Arquitetura Geral
- **Frontend**: React + TypeScript + Vite + Vanilla CSS moderno
- **Backend**: Node.js + TypeScript + Express (Arquitetura Modular) + Zod
- **Banco de Dados**: PostgreSQL 16 + Prisma ORM
- **Armazenamento de Evidências**: Storage Multi-provider (Local / Azure Blob Storage / AWS S3)
- **Autenticação**: RBAC Corporativo com suporte a Microsoft Entra ID (Azure AD) e JWT

---

## 📁 Estrutura de Diretórios
```text
torre/
├── backend/            # API REST em Node.js / TypeScript
│   ├── prisma/         # Schema canônico (PostgreSQL), migrations e seed
│   └── src/            # Módulos, middlewares e utilitários
├── frontend/           # SPA em React + TypeScript + Vite (Fase 22)
│   └── src/
│       ├── api/        # Cliente HTTP, hook de imagens autenticadas
│       ├── context/     # AuthContext, ToastContext
│       ├── components/  # Layout responsivo + componentes de UI reutilizáveis
│       ├── pages/       # Login, Dashboard, Atividades, Ranking, Mural, Admin
│       └── styles/      # CSS global (mobile-first, dark mode)
├── storage/            # Armazenamento local temporário de arquivos
├── docs/               # Documentação arquitetural e especificações
├── docker-compose.yml  # Orquestração de containers (Postgres)
├── .env.example        # Modelo de variáveis de ambiente
├── comando.md          # Especificação de fases e comandos
└── planejamento.md     # Especificação detalhada de regras e modelo
```

---

## ▶️ Como executar

### Desenvolvimento local (SQLite — não requer Docker nem instalar PostgreSQL)
Caminho padrão em máquinas sem Docker (ex.: notebook corporativo bloqueado). O schema é
idêntico ao PostgreSQL — ver [docs/DATABASE.md](docs/DATABASE.md#0-fonte-de-verdade-e-migrations).

```bash
cd backend
cp ../.env.example .env      # ajuste os segredos
npm install
npm run db:setup:sqlite      # cria backend/prisma/dev.db + roda o seed
npm run dev                  # API em http://localhost:3001
```

- **Swagger (testar a API pelo navegador)**: http://localhost:3001/api/docs
- **Prisma Studio (ver/editar os dados pelo navegador)**:
  ```bash
  npm run prisma:studio:sqlite   # abre http://localhost:5555
  ```

### PostgreSQL via Docker (quando houver ambiente disponível — CI/deploy)
```bash
docker compose up -d postgres
cd backend
npm run db:setup             # migrate deploy + generate + seed
npm run dev
```

### Frontend (React + TypeScript + Vite)
Com o backend já rodando em `http://localhost:3001`:
```bash
cd frontend
npm install
npm run dev                  # SPA em http://localhost:5173
```
Login de teste: `renan@empresa.com` / `user123` (participante) ou `admin@empresa.com` / `admin123`
(ADMIN_MASTER — vê também o menu "Aprovações").

### Verificação e testes
```bash
npm run typecheck        # type-check de src/ + prisma/
npm run build             # compilação de produção
npm run test:db           # Fase 1 — banco e ledger
npm run test:api          # Fase 2 — API base
npm run test:auth         # Fase 3 — autenticação e RBAC
npm run test:modalities   # Fase 4 — modalidades
npm run test:scoring      # Fase 5 — motor de pontuação
npm run test:activities   # Fase 6 — registro de atividades
npm run test:evidence     # Fase 7 — upload e evidências
npm run test:admin-activities  # Fase 8 — validação administrativa
npm run test:audit        # Fase 9 — auditoria
npm run test:ranking      # Fase 10 — ranking
npm run test:levels       # Fase 11 — níveis
npm run test:achievements # Fase 12 — conquistas
npm run test:challenges   # Fase 13 — desafios
npm run test:rewards      # Fase 14 — premiações
npm run test:posts        # Fase 15 — mural social
npm run test:notifications # Fase 16 — notificações
npm run test:dashboard    # Fase 17 — dashboard
npm run test:profile      # Fase 18 — perfil e avatar
npm run test:history      # Fase 19 — histórico do usuário
npm run test:admin-dashboard # Fase 20 — painel administrativo
npm run test:game-rules   # Fase 21 — regras do jogo
```

O frontend tem seu próprio `npm run typecheck` e `npm run build` (dentro de `frontend/`). Não há
suíte automatizada de testes de UI ainda — a verificação da Fase 22 foi feita end-to-end em
navegador real (Playwright), com screenshots e checagem de erros de console/rede.

> `npm run db:setup:sqlite` reseta de fato o banco (schema + dados) a cada execução. Rode-o antes
> de qualquer `test:*` isolado para garantir um estado limpo e reprodutível.

### Usuários do seed
| E-mail | Senha | Perfil |
|---|---|---|
| `admin@empresa.com` | `admin123` | ADMIN_MASTER |
| `gestor@empresa.com` | `admin123` | ADMIN |
| `renan@empresa.com` | `user123` | PARTICIPANTE |

---

## 🚀 Fases de Desenvolvimento
O desenvolvimento segue estritamente a metodologia por fases sucessivas:

| Fase | Escopo | Status |
|---|---|---|
| 0 | Planejamento e estrutura inicial | ✅ Concluída |
| 1 | Banco de dados PostgreSQL & Prisma | ✅ Concluída |
| 2 | Backend base & configurações da API | ✅ Concluída |
| 3 | Autenticação e autorização (RBAC) | ✅ Concluída |
| 4 | Modalidades configuráveis | ✅ Concluída |
| 5 | Motor de pontuação e ledger | ✅ Concluída |
| 6 | Registro de atividades | ✅ Concluída |
| 7 | Evidências (upload e storage) | ✅ Concluída |
| 8 | Validação administrativa (aprovação/rejeição) | ✅ Concluída |
| 9 | Auditoria | ✅ Concluída |
| 10 | Ranking | ✅ Concluída |
| 11 | Níveis | ✅ Concluída |
| 12 | Conquistas | ✅ Concluída |
| 13 | Desafios | ✅ Concluída |
| 14 | Premiações | ✅ Concluída |
| 15 | Mural Social | ✅ Concluída |
| 16 | Notificações | ✅ Concluída |
| 17 | Dashboard (endpoint agregador — sem frontend) | ✅ Concluída |
| 18 | Perfil e Avatar (endpoints — sem frontend) | ✅ Concluída |
| 19 | Histórico do Usuário | ✅ Concluída |
| 20 | Painel Administrativo (endpoint agregador — sem frontend) | ✅ Concluída |
| 21 | Regras do Jogo | ✅ Concluída |
| 22 | Responsividade e UX (frontend criado — React/TS/Vite) | ⏳ Aguardando aprovação |
| 23–25 | Segurança, testes, documentação | ⬜ Não iniciadas |
