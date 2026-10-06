# Ranking e Participantes

Duas telas distintas, propositalmente com ordenações diferentes:

- **Ranking**: ordenado por pontuação — serve pra disputa/competição.
- **Participantes**: ordenado alfabeticamente — serve pra navegação/consulta ("conhecer quem compete", não "ver quem está ganhando").

## Ranking (`GET /ranking`)

Sempre calculado **na hora**, nunca de um valor em cache no frontend — muda automaticamente assim que uma atividade é aprovada, sem nenhum recálculo manual.

**`GERAL` sem filtro de modalidade** lê `User.totalPoints` direto — é o mesmo "placar de competição" que Dashboard/Perfil mostram, já mantido corretamente a cada transação (reset de ciclo incluso). **`SEMANA`/`MÊS`/`ANO`, ou `GERAL` com filtro de modalidade**, recalculam somando o ledger de transações (`points_transactions`) no intervalo/filtro pedido, com o MESMO critério de inclusão que decide o que conta pro `totalPoints` (ver [ciclos.md](./ciclos.md) e [pontuacao.md](./pontuacao.md)): sempre inclui `CYCLE_RESET` e débitos (`REVERSAL`, pontos negativos), além de ganhos com um ciclo de premiação ativo no momento.

**Bug corrigido (relatado pelo usuário)**: antes dessa correção, a soma do ledger exigia só `cycleId != null` — mas o próprio lançamento `CYCLE_RESET` nasce com `cycleId = null` de propósito (é a exceção que sempre deveria contar), então ficava de fora da soma. Resultado: o reset nunca era descontado, e o ranking (geral e todos os períodos) continuava empilhando pontos de ciclos já encerrados pra sempre, mesmo com `User.totalPoints` corretamente zerado. Não confundir com `lifetimePoints` (campo **separado**, nunca resetado, visível no ranking como `totalPointsAllTime` — existe só pra sustentar as conquistas `TOTAL_POINTS` vitalícias, ver [conquistas.md](./conquistas.md)): esse sempre funcionou certo e continua mostrando o acumulado de vida toda, de propósito.

**Períodos**: `GERAL`, `SEMANA` (desde a última segunda-feira), `MÊS`, `ANO`.

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
