# Mural Social

## Publicações (`Post`)

Texto + foto opcional (armazenada como qualquer outro arquivo do sistema, servida só por endpoint autorizado). Um post pode pertencer a dois contextos:

- **Mural geral** (`eventId = null`): visível a qualquer autenticado.
- **Grupo de um evento** (`eventId` preenchido): visível só a quem participa daquele evento (qualquer status: `REGISTERED`/`ATTENDED`/`NO_SHOW`) ou a um admin — reaproveita a mesma estrutura de posts/comentários/curtidas do Mural geral, checada por `assertEventGroupAccess` em todo endpoint de posts, comentários e curtidas.

## Visibilidade e status

`PUBLISHED`/`HIDDEN`/`MODERATED`. Um participante sempre vê publicações `PUBLISHED` de todo mundo **mais as próprias em qualquer status** (para saber se algo seu foi moderado). Um admin pode filtrar explicitamente por status para acessar a fila de moderação.

## Exclusão e moderação

- O próprio autor pode excluir a qualquer momento (sem gerar auditoria — é rotina).
- Um admin pode excluir a publicação de outro usuário (gera auditoria `DELETE_POST`, com motivo opcional) ou moderar sem excluir: `HIDE`→`HIDDEN`, `MODERATE`→`MODERATED`, `RESTORE`→volta a `PUBLISHED`. Toda moderação é auditada com o status antes/depois e o motivo.

## Comentários e curtidas

Comentário só é permitido em post `PUBLISHED`. Curtida é única por pessoa/post (não dá pra curtir duas vezes; tentar de novo dá 409). Exclusão de comentário segue a mesma regra de posts: o próprio autor, ou um admin (auditado como `MODERATE_COMMENT`).
