# Mural Social

## Publicações (`Post`)

Texto + foto opcional (armazenada como qualquer outro arquivo do sistema, servida só por endpoint autorizado). Um post pode pertencer a dois contextos:

- **Mural geral** (`eventId = null`): visível a qualquer autenticado.
- **Grupo de um evento** (`eventId` preenchido): visível só a quem participa daquele evento (qualquer status: `REGISTERED`/`ATTENDED`/`NO_SHOW`) ou a um admin — reaproveita a mesma estrutura de posts/comentários/curtidas do Mural geral, checada por `assertEventGroupAccess` em todo endpoint de posts, comentários e curtidas.

## Visibilidade e status

`PUBLISHED`/`HIDDEN`/`MODERATED`. Um participante sempre vê publicações `PUBLISHED` de todo mundo **mais as próprias em qualquer status** (para saber se algo seu foi moderado). Um admin pode filtrar explicitamente por status para acessar a fila de moderação.

## Exclusão e moderação

- O próprio autor pode excluir a qualquer momento (sem gerar auditoria — é rotina). Botão 🗑️ direto no card da publicação.
- Um admin pode excluir a publicação de outro usuário (gera auditoria `DELETE_POST`, com motivo opcional — a tela não pede motivo, mas a API aceita) ou moderar sem excluir: `HIDE`→`HIDDEN`, `MODERATE`→`MODERATED`, `RESTORE`→volta a `PUBLISHED`. Toda moderação é auditada com o status antes/depois e o motivo (opcional na tela, um textarea).
- **Tela (Mural)**: qualquer admin vê, em toda publicação `PUBLISHED`, os botões 🙈 Ocultar e ⚠️ Moderar (além do 🗑️ Excluir, que todo admin já tinha acesso via API mas sem UI até esta feature); numa publicação já `HIDDEN`/`MODERATED`, vê ♻️ Restaurar em vez dos dois primeiros. Um seletor "Publicações visíveis / Ocultas / Moderadas" (só visível pra admin) alterna o feed entre o que qualquer participante vê (`PUBLISHED` + próprias) e a fila de moderação de todo mundo — sem isso, um admin não teria como *ver* (e portanto restaurar) a publicação oculta de outra pessoa pela tela, já que o filtro padrão do `GET /posts` some com publicações não-`PUBLISHED` de terceiros.

## Comentários e curtidas

Comentário só é permitido em post `PUBLISHED`. Curtida é única por pessoa/post (não dá pra curtir duas vezes; tentar de novo dá 409). Exclusão de comentário segue a mesma regra de posts: o próprio autor, ou um admin (auditado como `MODERATE_COMMENT`) — ambos com botão 🗑️ na tela, ao lado de cada comentário.
