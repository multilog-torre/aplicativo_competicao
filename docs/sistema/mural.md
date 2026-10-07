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
- **Leitura do arquivo fora da transação (bug corrigido, aconteceu em produção)**: `storage.read()` busca a imagem no Cloudinary — uma chamada de rede externa, que pode demorar. Antes, essa leitura acontecia DENTRO da transação atômica de `approve()`, que tem um timeout padrão do Prisma de 5s; quando o Cloudinary demorava (ex.: instabilidade de rede), a transação era fechada pelo próprio Prisma antes de terminar, e a aprovação inteira falhava sem nenhum rastro de erro no app (a atividade ficava presa em `PENDING`, mesmo com a evidência já salva — só a tentativa de criar o post automático em cima de uma transação já expirada que quebrava, bem no fim). Corrigido: a leitura do storage agora acontece ANTES de abrir a transação — ela passa a conter só operações de banco, rápidas e previsíveis, sem nenhuma chamada de rede externa no meio.
- **Evidência tardia (bug corrigido)**: quando a modalidade NÃO exige evidência, a aprovação automática (e o post) acontece no ato de criar a atividade — antes de qualquer evidência opcional existir. Se a pessoa anexa uma foto mesmo assim, ela chega numa chamada HTTP separada, DEPOIS que o post já foi criado sem imagem. `EvidenceService.upload` cobre esse caso: sempre que a evidência enviada é uma imagem, chama `PostService.attachEvidenceImageIfMissing(activityId, ...)`, que acha o post pela `activityId` e anexa a foto retroativamente **se ele ainda não tiver uma** (a primeira imagem que chega "ganha" — evidências extras depois não trocam a foto já anexada).
- O texto do post (`content`) é gerado automaticamente: `"Registrou uma atividade de {modalidade} ({quantidade} {unidade}) e ganhou {pontos} pontos! 🎉"`.
- **Data exibida no card (bug corrigido)**: o card mostra a **data da atividade** (`Post.activity.activityDate`, a data que a pessoa escolheu ao registrar — só data, sem horário, porque o formulário de registro não tem campo de hora), não `Post.createdAt` (quando o post foi criado/aprovado). Isso evita que uma atividade registrada com atraso (ex.: "corri ontem", registrado hoje) apareça no Mural como se tivesse acontecido no momento da postagem. Só vale pra posts automáticos — um post manual (sem `activity`) continua mostrando data **e hora** de `createdAt`, porque ali é realmente "quando a pessoa escreveu aquilo".
- **Ninguém é notificado em massa** por essa publicação — ver "Notificações" abaixo.

## Visibilidade e status

`PUBLISHED`/`HIDDEN`/`MODERATED`. Um participante sempre vê publicações `PUBLISHED` de todo mundo **mais as próprias em qualquer status** (para saber se algo seu foi moderado). Um admin pode filtrar explicitamente por status para acessar a fila de moderação.

## Exclusão e moderação

- O próprio autor pode excluir a qualquer momento (sem gerar auditoria — é rotina). Botão 🗑️ direto no card da publicação.
- Um admin pode excluir a publicação de outro usuário (gera auditoria `DELETE_POST`, com motivo opcional — a tela não pede motivo, mas a API aceita) ou moderar sem excluir: `HIDE`→`HIDDEN`, `MODERATE`→`MODERATED`, `RESTORE`→volta a `PUBLISHED`. Toda moderação é auditada com o status antes/depois e o motivo (opcional na tela, um textarea).
- **Tela (Mural)**: qualquer admin vê, em toda publicação `PUBLISHED`, os botões 🙈 Ocultar e ⚠️ Moderar (além do 🗑️ Excluir, que todo admin já tinha acesso via API mas sem UI até esta feature); numa publicação já `HIDDEN`/`MODERATED`, vê ♻️ Restaurar em vez dos dois primeiros. Um seletor "Publicações visíveis / Ocultas / Moderadas" (só visível pra admin) alterna o feed entre o que qualquer participante vê (`PUBLISHED` + próprias) e a fila de moderação de todo mundo — sem isso, um admin não teria como *ver* (e portanto restaurar) a publicação oculta de outra pessoa pela tela, já que o filtro padrão do `GET /posts` some com publicações não-`PUBLISHED` de terceiros.

## Comentários e reações

Comentário só é permitido em post `PUBLISHED`. Exclusão de comentário segue a mesma regra de posts: o próprio autor, ou um admin (auditado como `MODERATE_COMMENT`) — ambos com botão 🗑️ na tela, ao lado de cada comentário.

**Reações** (`PostReaction`, e agora também `CommentReaction`): a pessoa escolhe **qualquer emoji do Unicode** (antes era um conjunto fixo de 5 — aberto a pedido do usuário) e pode **trocar** quando quiser; ainda é 1 reação por pessoa/post ou por pessoa/comentário (`@@unique`), trocar é um `update`, não um novo registro.

- **Validação**: o backend usa a lib `emoji-regex` (`post.dto.ts::ReactionEmojiSchema`) pra garantir que o valor recebido é **exatamente 1 emoji** (aceita sequências complexas — família, tom de pele, bandeira — como 1 emoji só; rejeita texto solto ou vários emojis colados).
- **Tela**: componente `ReactionPicker` (`frontend/src/components/ui/ReactionPicker.tsx`), reutilizado por post e comentário. Mostra um chip por emoji já usado (com contagem) mais um botão "+" que abre o seletor completo (`emoji-picker-react`, com busca) — carregado **sob demanda** (`React.lazy`), só quando alguém abre o seletor pela primeira vez, pra não pesar no carregamento inicial do site (~330KB que ficam de fora do bundle principal).
- Clicar num chip que já é a própria reação remove; clicar em outro chip ou escolher no seletor troca.
- **Reação em comentário**: `POST/DELETE /posts/:id/comments/:commentId/reactions`, mesmo mecanismo. `GET /posts/:id/comments` já devolve `reactionsSummary`/`reactionsCount`/`myReaction` por comentário, junto com o conteúdo.
- `GET /posts` e `GET /posts/:id` devolvem os mesmos três campos (`reactionsSummary`, `reactionsCount`, `myReaction`) pro post.

## Notificações do Mural

Reagir ou comentar notifica **só o dono do post (ou o autor do comentário, no caso de reação em comentário)** — nunca quem reagiu/comentou, nunca em massa para todo mundo — mesmo padrão 1-notificação-por-usuário do resto do sistema (ver [notificacoes.md](./notificacoes.md)). Reagir na própria publicação/comentário, ou comentar nele, nunca gera notificação para si mesmo. Trocar de emoji não dispara uma nova notificação — só a *primeira* reação de cada pessoa num post/comentário notifica; comentar sempre notifica (cada comentário é um evento novo).
