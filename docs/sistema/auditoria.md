# Auditoria

## O que é registrado

Toda operação administrativa relevante do sistema grava uma linha imutável em `AuditLog`: quem fez (`userId`), o quê (`action`), em qual entidade (`entity`/`entityId`), e — quando aplicável — o valor antes e depois (`oldValues`/`newValues`, JSON serializado). Login também é auditado (`action = LOGIN`), assim como o autocadastro (`SELF_REGISTER`).

Não é uma lista fechada de ações — cada módulo audita as próprias operações administrativas (aprovações/rejeições de atividade e evento, lançamentos manuais de pontos e reversões, CRUD de modalidades/níveis/conquistas/desafios/ciclos/recompensas/departamentos/regras do jogo, gestão de contas e papéis, moderação do mural, upload de evidência, alteração de configurações do sistema em `UPDATE_SETTING`).

**`userId` pode ser `null`** — isso significa "nenhum humano responsável", não um dado faltando. O único caso hoje é a aprovação automática de atividade (`AUTO_APPROVE_ACTIVITY`, ver [atividades.md](./atividades.md)), que audita separadamente da aprovação manual (`APPROVE_ACTIVITY`) justamente para deixar essa distinção rastreável.

## Acesso

Restrito a `ADMIN_MASTER` — mesmo nível de governança que a gestão de contas ([usuarios-e-acesso.md](./usuarios-e-acesso.md)). Um `ADMIN` comum não acessa a trilha de auditoria, mesmo podendo executar boa parte das ações que geram essas entradas.

## Consulta

`GET /admin/audit-logs`: paginado, filtrável por usuário, ação, entidade, entidade específica (`entityId`) e período (`dateFrom`/`dateTo`). `GET /admin/audit-logs/:id`: detalhe individual, com `oldValues`/`newValues` já desserializados como objeto (não como string JSON crua).

## O que nunca aparece na auditoria

Senhas — nunca em texto puro nem em hash, mesmo quando a ação é justamente criar/alterar a conta de alguém.
