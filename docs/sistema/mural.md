# Mural Social

## Publicações (`Post`)

Texto + foto opcional (armazenada como qualquer outro arquivo do sistema, servida só por endpoint autorizado). Um post pode pertencer a dois contextos:

- **Mural geral** (`eventId = null`): visível a qualquer autenticado.
- **Grupo de um evento** (`eventId` preenchido): visível só a quem participa daquele evento (qualquer status: `REGISTERED`/`ATTENDED`/`NO_SHOW`) ou a um admin — reaproveita a mesma estrutura de posts/comentários/reações do Mural geral, checada por `assertEventGroupAccess` em todo endpoint de posts, comentários e reações.

## Feed de atividades (posts automáticos)

Toda vez que uma atividade é **aprovada** (manual ou automaticamente — `AdminActivityService.approve()`), um post é criado sozinho no Mural geral (`eventId = null`), dentro da MESMA transação atômica que credita pontos/nível/conquistas/desafios e cria a notificação `ACTIVITY_APPROVED`. Não existe post automático para atividade só registrada (`PENDING`) nem para atividade rejeitada — só a aprovação publica.

- `Post.activityId` guarda o vínculo com a `UserActivity` que originou o post (`null` = post manual, escrito pela própria pessoa).
- O card mostra modalidade, ícone, quantidade/unidade e pontos ganhos — lidos ao vivo da atividade vinculada (`Post.activity` no include), não duplicados no Post.
- Se a atividade tiver uma evidência em formato de imagem (`jpg`/`jpeg`/`png`), ela é **copiada** para o storage do próprio post (mesma pasta `mural/{postId}` de uma foto manual) — o post passa a valer as regras de acesso de post (público a qualquer autenticado quando `PUBLISHED`), sem afrouxar o acesso privado do endpoint de evidência original (`/activities/:id/evidence/...`, que continua restrito a dono/admin). Evidência em outro formato (PDF, etc.) não vira foto — o post é criado normalmente, só sem imagem.
- O texto do post (`content`) é gerado automaticamente: `"Registrou uma atividade de {modalidade} ({quantidade} {unidade}) e ganhou {pontos} pontos! 🎉"`.
- **Ninguém é notificado em massa** por essa publicação — ver "Notificações" abaixo.

## Visibilidade e status

`PUBLISHED`/`HIDDEN`/`MODERATED`. Um participante sempre vê publicações `PUBLISHED` de todo mundo **mais as próprias em qualquer status** (para saber se algo seu foi moderado). Um admin pode filtrar explicitamente por status para acessar a fila de moderação.

## Exclusão e moderação

- O próprio autor pode excluir a qualquer momento (sem gerar auditoria — é rotina). Botão 🗑️ direto no card da publicação.
- Um admin pode excluir a publicação de outro usuário (gera auditoria `DELETE_POST`, com motivo opcional — a tela não pede motivo, mas a API aceita) ou moderar sem excluir: `HIDE`→`HIDDEN`, `MODERATE`→`MODERATED`, `RESTORE`→volta a `PUBLISHED`. Toda moderação é auditada com o status antes/depois e o motivo (opcional na tela, um textarea).
- **Tela (Mural)**: qualquer admin vê, em toda publicação `PUBLISHED`, os botões 🙈 Ocultar e ⚠️ Moderar (além do 🗑️ Excluir, que todo admin já tinha acesso via API mas sem UI até esta feature); numa publicação já `HIDDEN`/`MODERATED`, vê ♻️ Restaurar em vez dos dois primeiros. Um seletor "Publicações visíveis / Ocultas / Moderadas" (só visível pra admin) alterna o feed entre o que qualquer participante vê (`PUBLISHED` + próprias) e a fila de moderação de todo mundo — sem isso, um admin não teria como *ver* (e portanto restaurar) a publicação oculta de outra pessoa pela tela, já que o filtro padrão do `GET /posts` some com publicações não-`PUBLISHED` de terceiros.

## Comentários e reações

Comentário só é permitido em post `PUBLISHED`. Exclusão de comentário segue a mesma regra de posts: o próprio autor, ou um admin (auditado como `MODERATE_COMMENT`) — ambos com botão 🗑️ na tela, ao lado de cada comentário.

**Reações** (`PostReaction`) substituíram a curtida binária antiga (`PostLike`): a pessoa escolhe 1 emoji de um conjunto fixo — 👍 Curtir, ❤️ Amei, 👏 Aplaudir, 🔥 Mandou bem, 🎉 Comemorar (`post.dto.ts::REACTION_EMOJIS`, validado no backend, não é emoji livre) — e pode **trocar** quando quiser; ainda é 1 reação por pessoa/post (`@@unique([postId, userId])`), trocar é um `update`, não um novo registro. A tela mostra uma barra com os 5 emojis; o(s) que já tem alguma reação exibe a contagem ao lado, e o emoji escolhido pela própria pessoa fica destacado. `GET /posts` e `GET /posts/:id` devolvem `reactionsSummary` (contagem por emoji), `reactionsCount` (total) e `myReaction` (o emoji da própria pessoa, ou `null`).

## Notificações do Mural

Reagir ou comentar notifica **só o dono do post** (nunca quem reagiu/comentou, nunca em massa para todo mundo) — mesmo padrão 1-notificação-por-usuário do resto do sistema (ver [notificacoes.md](./notificacoes.md)). Reagir na própria publicação, ou comentar nela, nunca gera notificação para si mesmo. Trocar de emoji não dispara uma nova notificação — só a *primeira* reação de cada pessoa num post notifica o dono; comentar sempre notifica (cada comentário é um evento novo).
