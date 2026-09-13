# Usuários e Acesso

## Papéis (RBAC)

Três papéis fixos, cadastrados no seed (`Role`: `PARTICIPANTE`, `ADMIN`, `ADMIN_MASTER`). Um usuário pode ter mais de um papel ao mesmo tempo (tabela `UserRole`).

| Papel | O que pode fazer |
|---|---|
| `PARTICIPANTE` | Uso normal da plataforma: registrar atividades, ver o próprio perfil e o de colegas, participar de desafios/eventos, resgatar prêmios, postar no mural. Papel padrão de todo autocadastro. |
| `ADMIN` | Tudo do participante + aprovar/rejeitar atividades e eventos, gerenciar modalidades/níveis/conquistas/desafios/ciclos/recompensas/departamentos, lançar pontos manuais, moderar o mural. |
| `ADMIN_MASTER` | Tudo do ADMIN + gestão de contas (criar usuário, aprovar autocadastro, conceder/revogar papéis administrativos) + acesso à trilha de auditoria. É o único papel com acesso irrestrito: `requireRoles`/`requirePermission` sempre liberam automaticamente quem tem `ADMIN_MASTER`, mesmo que a rota peça outro papel específico. |

Duas proteções contra a plataforma ficar "sem dono": um `ADMIN_MASTER` não pode remover o próprio acesso de `ADMIN_MASTER`, e não é possível remover o último `ADMIN_MASTER` do sistema (`admin-user.service.ts`, `setRoles`).

## Como uma conta é criada

Existem **dois caminhos**, com regras bem diferentes:

### 1. Autocadastro (tela de login → "Criar conta")
- Só e-mails do domínio corporativo configurado (`SIGNUP_ALLOWED_EMAIL_DOMAIN`) podem se cadastrar.
- A pessoa **nunca escolhe a própria senha** — a conta nasce com a senha padrão da empresa (`DEFAULT_USER_PASSWORD`), trocável depois em "Meu Perfil".
- A conta nasce com `status = PENDING_APPROVAL` e papel `PARTICIPANTE`. **Não pode logar** até um `ADMIN_MASTER` aprovar.
- Todo `ADMIN_MASTER` recebe uma notificação (`NEW_USER_PENDING`) assim que alguém se autocadastra.
- **Não há nenhuma pontuação de bônus por criar conta** — o usuário nasce com `totalPoints = 0`.

### 2. Criação direta pelo ADMIN_MASTER (Admin > Usuários)
- Só `ADMIN_MASTER` pode fazer isso.
- A senha é escolhida pelo admin (mín. 6 caracteres) — nunca gerada automaticamente.
- Nasce direto com `status = ACTIVE` — sem etapa de aprovação.
- O papel é escolhido explicitamente na criação (pode já nascer `ADMIN`, inclusive).

## Status de conta

| Status | Efeito |
|---|---|
| `ACTIVE` | Login normal. |
| `PENDING_APPROVAL` | Login bloqueado com mensagem específica ("aguardando aprovação"). Só existe para contas de autocadastro. |
| `INACTIVE` | Login bloqueado ("conta inativa ou suspensa"). Um admin não pode desativar a própria conta (`admin-user.service.ts`). |

## Login e sessão

- `POST /auth/login`: valida e-mail/senha, gera `accessToken` (JWT curto, payload com `sub`, `email`, `name`, `roles`) e `refreshToken` (JWT longo, só com `sub`). Todo login bem-sucedido grava uma entrada `LOGIN` na auditoria.
- `POST /auth/refresh`: troca um refresh token válido por um novo par de tokens. Se o usuário não existir mais ou não estiver `ACTIVE`, falha.
- Toda rota autenticada (`ensureAuthenticated`) revalida o usuário no banco a cada requisição (não confia cegamente no payload do JWT) — um usuário desativado no meio de uma sessão perde o acesso imediatamente, mesmo com um token ainda "válido" pela expiração.
- `attachUserIfPresent`: variante usada em rotas públicas que preenche `req.user` quando há token, mas nunca bloqueia (ex.: `GET /game-rules` mostra passos inativos só pra quem está logado como admin).

## Dados de um usuário

Campos do cadastro: nome, e-mail (único), matrícula/`corporateId` (único, opcional), cargo (`position`), departamento, data de nascimento, sexo, avatar. Ver [perfil.md](./perfil.md) para como esses dados são editados e o que fica visível a colegas.

## Departamentos

Catálogo simples (`Department`): nome (único), descrição, status `ACTIVE`/`INACTIVE`. Leitura é pública (usada em formulários de perfil/cadastro). Excluir um departamento com colaboradores vinculados nunca apaga de fato — vira `INACTIVE` (soft delete), preservando o vínculo histórico de quem já esteve nele.

## Gestão administrativa de contas (`ADMIN_MASTER`)

- **Listar/buscar**: por nome, e-mail, papel ou status, paginado.
- **Editar**: nome, cargo, departamento, nascimento, sexo, status. Toda edição é auditada com valores antes/depois.
- **Conceder/revogar papéis**: substitui o conjunto de papéis do usuário pelo informado (não é incremental) — protegido pelas duas regras de auto-exclusão descritas acima.
