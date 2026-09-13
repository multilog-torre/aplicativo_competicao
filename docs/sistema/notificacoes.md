# Notificações

## O modelo

Cada notificação é uma linha em `Notification`: `title`, `message`, `type` (um de 15 valores fixos), `isRead`, `referenceId` (aponta para a entidade que a originou), sempre vinculada a **um único usuário** — não existe notificação em massa "para todo mundo" de uma vez (mesmo quando o gatilho afeta várias pessoas, como um fechamento de ciclo, cada pessoa recebe sua própria linha).

Sem WebSocket/SSE no projeto — "tempo real" aqui significa **polling**: o frontend pergunta periodicamente se há algo novo (a cada 20s, tanto para o contador do sino quanto para o toast de conquista).

## Os 15 tipos e o que dispara cada um

| Tipo | O que dispara | Vai para |
|---|---|---|
| `ACTIVITY_APPROVED` | Admin aprova uma atividade | Autor da atividade |
| `ACTIVITY_REJECTED` | Admin rejeita, com o motivo na mensagem | Autor da atividade |
| `POINTS_ADJUSTED` | Admin lança `BONUS`/`PENALTY`/`ADJUSTMENT` manual, ou reverte (`REVERSAL`) uma transação | Usuário afetado |
| `RANKING_UP` | Sobe de posição no ranking geral por causa de uma atividade aprovada | O próprio usuário |
| `LEVEL_UP` | Sobe de nível (nunca dispara em queda) | O próprio usuário |
| `ACHIEVEMENT_UNLOCKED` | Motor de conquistas desbloqueia uma badge | O próprio usuário |
| `CHALLENGE_COMPLETED` | Conclui um desafio | O próprio usuário |
| `REWARD_UPDATE` | Resgate de prêmio aprovado, entregue ou cancelado | Quem resgatou |
| `NEW_USER_PENDING` | Alguém se autocadastra e fica pendente | Todo `ADMIN_MASTER` |
| `CYCLE_ENDED` | Fechamento de ciclo — uma para quem ficou no pódio (com o prêmio, se houver), outra genérica para os demais avisando o reset | Todos os usuários ativos |
| `EVENT_APPROVED` / `EVENT_REJECTED` | Admin aprova/rejeita um evento proposto | Quem criou o evento |
| `EVENT_UPDATED` | Data de um evento muda | Todo inscrito |
| `EVENT_BONUS_CREDITED` | Admin confirma presença e credita o bônus | Quem compareceu |
| `INFO` | Valor padrão do schema | Nenhum fluxo atual usa este tipo |

## Central de notificações (sino no topbar)

Componente `NotificationBell` (frontend), presente no cabeçalho para qualquer usuário logado:

- **Badge de contagem**: número de não lidas, atualizado por polling a cada 20s (`GET /notifications/unread-count`).
- **Painel** (abre ao clicar): lista as últimas notificações (`GET /notifications?limit=30`), mais recente primeiro. Não lidas aparecem destacadas com uma bolinha.
- **Clicar numa notificação a marca como lida** (`POST /notifications/:id/read`) — atualização otimista na tela, sem esperar a resposta do servidor.
- **Excluir uma notificação** (ícone de lixeira em cada item) — `DELETE /notifications/:id`. Só o dono pode excluir a própria.
- **"Marcar todas como lidas"** (`POST /notifications/read-all`) e **"Excluir todas"** (`DELETE /notifications`, sem `:id`) — os dois com ícone (não emoji — ver nota de design abaixo) na barra de ações do painel. "Excluir todas" pede confirmação antes (ação destrutiva e irreversível).

### Nota de design: por que os ícones da central são SVG, não emoji

Emoji depende da fonte de emoji colorida do sistema/navegador para renderizar de forma legível. Em vários ambientes ele cai para uma variante monocromática (ex.: 🗑️ virando um ícone cinza/branco quase invisível) — foi exatamente um bug relatado e corrigido nesta central: o botão de excluir ficou branco sobre fundo branco por causa disso combinado com uma opacidade baixa. A partir dessa correção, os ícones de ação da central (lixeira, check) são SVG inline com `currentColor`, garantindo a mesma aparência em qualquer navegador/SO — mesmo padrão já usado no ícone da seção Participantes (ver [ranking-e-participantes.md](./ranking-e-participantes.md)).

### Nota de CSS: cuidado com o vazamento de estilo do topbar

O painel da central é um `<div style="position:fixed">` renderizado dentro do `<header class="topbar">` no DOM (mesmo aparecendo visualmente sobre a página inteira). Uma regra pensada só para o fundo escuro do topbar (`.topbar .btn--ghost { color: #fff }`) já vazou para dentro desse painel branco, deixando botões invisíveis — corrigido com uma regra mais específica sobrescrevendo a cor dentro do painel. Qualquer elemento novo dentro de componentes "flutuantes" que na verdade vivem dentro do `<header>` no DOM deve ter sua cor testada explicitamente, nunca assumida por herança.

Também por essa mesma razão de posicionamento, um `Modal` de confirmação (`ConfirmModal`) precisa de `z-index` maior que o de qualquer drawer (painel de notificações, painel de filtros) para poder abrir **por cima** de um drawer já aberto — do contrário os cliques nos botões do modal ficam bloqueados pelo drawer por baixo.

## Cobertura no frontend

Hoje, **todos** os 15 tipos são criados e ficam disponíveis via API, e a central de notificações (sino) mostra todos eles igualmente. Antes da central existir, só `ACHIEVEMENT_UNLOCKED` tinha uma superfície própria no frontend (o toast de celebração descrito abaixo) — os outros 14 tipos ficavam só acessíveis via API, sem nenhuma tela.

## Toast de conquista desbloqueada (`AchievementUnlockWatcher`)

Componente separado, independente da central: faz polling a cada 20s especificamente por notificações `ACHIEVEMENT_UNLOCKED` ainda não lidas e, ao encontrar uma, mostra um toast animado (ícone + nome + pontos) por 5,5s, marcando-a como lida no mesmo instante (nunca celebra a mesma conquista duas vezes). Continua existindo em paralelo à central — a central também mostra essas notificações na lista, só que sem a animação de celebração.
