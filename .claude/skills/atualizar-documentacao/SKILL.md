---
name: atualizar-documentacao
description: Use SEMPRE que uma mudança de código neste projeto (Torre) alterar uma regra de negócio ou comportamento visível ao usuário — novo fluxo, novo campo, mudança de aprovação/pontuação/permissão, novo toggle de configuração, etc. Garante que docs/sistema/*.md, a seção "Como funciona?" (GameRuleStep) e, quando aplicável, o ambiente de produção fiquem sincronizados com o código antes de considerar a tarefa concluída.
---

# Atualizar documentação e "Como funciona?"

Este projeto tem duas frentes de documentação funcional que **facilmente ficam
desatualizadas** porque vivem fora do código que implementa a regra, e nada
falha automaticamente (build/testes) se ficarem esquecidas:

1. **`docs/sistema/*.md`** — documentação funcional de referência (lida por
   humanos e por sessões futuras do Claude Code).
2. **Seção "Como funciona?" no app** (`GameRuleStep`, tabela editável por
   admin, populada inicialmente pelo `backend/prisma/seed.ts`) — é o que o
   *participante* vê explicando o fluxo do jogo.

## Quando isso se aplica

Sempre que uma tarefa nesta sessão:
- Mudar uma regra de negócio (pontuação, aprovação, limites, permissões,
  ciclos, conquistas, desafios, recompensas, etc.);
- Adicionar/remover um passo do fluxo do participante (registro → evidência →
  aprovação → pontos → ranking → premiações);
- Adicionar um novo comportamento configurável (toggle, configuração
  administrativa) que muda o que o participante vive na prática.

Não se aplica a refactors internos, correções de bug sem mudança de
comportamento observável, ou trabalho puramente de infraestrutura/deploy.

## Checklist (fazer ANTES de considerar a tarefa concluída, não depois)

1. **`docs/sistema/`**: identifique o(s) arquivo(s) cujo conteúdo descreve o
   comportamento que mudou (ex.: `atividades.md`, `pontuacao.md`,
   `auditoria.md`, `usuarios-e-acesso.md`) e atualize o texto. Se a mudança
   criar uma nova exceção a uma regra geral já documentada em outro arquivo
   (ex.: a "Regra de Ouro" em algum doc de governança), adicione uma nota
   cruzada lá também.
2. **`backend/prisma/seed.ts` → `gameRuleSteps`**: se a mudança afeta o que o
   participante vê/faz no fluxo do jogo, atualize (ou adicione/remova) o
   passo correspondente nesse array, com uma frase curta e direta — é uma
   lista de passos pra leitura rápida, não um manual.
3. **Sincronizar o ambiente já rodando**: o `seed.ts` só roda de novo quando o
   banco é recriado do zero — em produção (`render.yaml`), o `startCommand`
   **não** re-executa o seed a cada deploy, então mudar o array no código
   **não** atualiza o texto que já existe no banco de produção. Se houver um
   ambiente de produção ativo com usuários reais:
   - Pergunte ao usuário se quer que essa sincronização seja feita agora
     (é uma escrita em dado de produção — trate como ação a confirmar, não
     assuma).
   - Se sim, aplique via API autenticado como `ADMIN_MASTER`
     (`PATCH /game-rules/:id`) — nunca acessando o banco diretamente.
   - **Cuidado com encoding**: chamadas HTTP com corpo JSON contendo acentos
     feitas via PowerShell (`Invoke-RestMethod`/`ConvertTo-Json` sem
     configurar a codificação corretamente) podem corromper caracteres
     acentuados/travessões no banco. Prefira montar a requisição via
     `System.Net.Http.HttpClient` com `StringContent(...,
     [System.Text.Encoding]::UTF8, "application/json")`, e **sempre releia o
     dado gravado depois** (`GET`) pra confirmar que os acentos vieram
     corretos antes de seguir.
4. **Confirme visualmente**: depois de atualizar, refaça um `GET` (local e,
   se aplicável, produção) e confira que o texto exibido é o esperado — não
   assuma que o `PATCH`/seed funcionou só porque a chamada retornou 200/OK.

## Por que isso é uma skill (e não só a memória `docs-sistema-manutencao`)

A memória existente já cobre "atualizar `docs/sistema/` a cada mudança de
comportamento". Esta skill existe pra tornar esse hábito **auto-suficiente
mesmo numa sessão nova**: ela é carregada pela lista de skills disponíveis a
cada turno, então mesmo sem memória de sessões passadas, o processo de
"mudei uma regra → preciso atualizar docs E a tela Como funciona E, se
houver produção rodando, sincronizar lá" fica documentado e reaplicável.
