# Ranking e Participantes

Duas telas distintas, propositalmente com ordenações diferentes:

- **Ranking**: ordenado por pontuação — serve pra disputa/competição.
- **Participantes**: ordenado alfabeticamente — serve pra navegação/consulta ("conhecer quem compete", não "ver quem está ganhando").

## Ranking (`GET /ranking`)

Sempre calculado **na hora**, direto do ledger de transações (`points_transactions`) — nunca de um valor em cache no frontend, e nunca apenas do agregado `User.totalPoints` (que só serve para o período `GERAL`/vitalício). Isso garante que o ranking mude automaticamente assim que uma atividade é aprovada, sem nenhum recálculo manual.

**Períodos**: `GERAL` (vitalício), `SEMANA` (desde a última segunda-feira), `MÊS`, `ANO` — cada um soma só as transações daquele intervalo de `createdAt`.

**Filtros**: por modalidade (soma só transações de atividades daquela modalidade) e por departamento.

**Empate**: pontuação igual → ordem alfabética pelo nome.

Todo usuário `ACTIVE` aparece na lista, mesmo com 0 pontos no período filtrado (para mostrar a posição completa, não só quem pontuou).

## Participantes (`GET /participants`)

Lista de todo mundo que compete (usuários `ACTIVE`), com busca por nome/cargo e filtro por departamento, sempre ordenada alfabeticamente. Cada item mostra: avatar, nome, cargo, departamento, nível, pontos totais, contagem de conquistas. Clicar em alguém abre o perfil completo (próxima seção).

## O perfil de um colega é tão completo quanto o próprio

Esta é uma decisão de produto deliberada, tomada explicitamente com o usuário: o perfil de qualquer colega (`GET /profile/:userId`) mostra **exatamente os mesmos dados** que o próprio perfil mostraria — não uma versão resumida. Isso reverteu uma restrição de privacidade mais antiga (que escondia data de nascimento, sexo, lista de conquistas e atividades recentes de terceiros).

O que aparece no perfil de qualquer pessoa, vista por qualquer colega autenticado:

| Dado | Observação |
|---|---|
| Nome, cargo, departamento, avatar | Sempre público |
| Pontos totais, posição no ranking geral, nível, próximo nível | Sempre público |
| **Data de nascimento e idade calculada** | Calculada no backend (`calculateAge`), nunca no frontend |
| Sexo | — |
| "Participante desde" (`createdAt`) | — |
| Conquistas desbloqueadas (lista completa) | Reaproveita o mesmo componente/endpoint do próprio perfil |
| Progresso rumo às conquistas ainda bloqueadas | idem |
| Atividades recentes (últimas 10, com data/modalidade/pontos/status) | idem |

O que **nunca** é exposto, nem no próprio perfil: senha, e-mail (fora das telas administrativas), e o caminho bruto de armazenamento de arquivos (avatar/ícones sempre servidos por endpoint do backend).

Achievements e progresso de qualquer usuário (`/achievements/users/:userId` e `/achievements/users/:userId/progress`) seguem a mesma abertura — não há mais bloqueio de acesso cruzado entre colegas ali.
