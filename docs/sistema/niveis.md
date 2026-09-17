# Níveis de Progressão

## Configuração (`Level`)

Cadastro administrável: `levelNumber` (único, define a ordem), `name`, `minPoints` (único, faixa mínima de pontos), `badgeIcon`, `description`. Sem limite de quantos níveis podem existir.

### Faixas do seed, calibradas para o ciclo de 3 meses

Como `totalPoints` zera a cada fechamento de ciclo de premiação (`CYCLE_RESET`, ver [ciclos.md](./ciclos.md)) e os ciclos hoje duram 3 meses, as faixas do seed foram pensadas pra esse período, não pra um ano inteiro: **Iniciante 0 / Explorador 700 / Competidor 1.800 / Destaque 3.200 / Campeão 5.500**. O nível máximo (Campeão) foi calibrado pra ser alcançável só perto do fim do ciclo por alguém muito engajado (atividade quase diária, em várias modalidades — ver [atividades.md](./atividades.md) pros valores de pontuação por modalidade que sustentam essa conta), não nas primeiras semanas.

## Como a reclassificação funciona

O nível de um usuário nunca é escolhido manualmente — é sempre recalculado a partir do `totalPoints` atual, escolhendo **o nível de maior `minPoints` que ainda seja ≤ ao total do usuário**. Se o total for tão baixo (ou negativo, após uma penalidade) que nenhum nível se encaixe, o usuário fica no nível de menor `minPoints` cadastrado como piso — nunca fica "sem nível" enquanto existir ao menos um configurado.

A reclassificação roda automaticamente, dentro da mesma transação atômica, em **todo** evento que altera `totalPoints` — ou seja, depois de qualquer uma das 10 fontes de pontuação listadas em [pontuacao.md](./pontuacao.md). Não existe um passo manual de "recalcular nível".

## Notificação de subida (`LEVEL_UP`)

Só dispara quando o **número** do novo nível é maior que o do nível anterior — uma queda de nível causada por uma `PENALTY`, por exemplo, nunca gera essa notificação ("uma queda não é uma conquista"). Subir de nível notifica sempre, seja qual for a origem dos pontos que causaram a subida.

## Efeito de editar as faixas de nível

Criar, editar ou excluir um nível **reclassifica todos os usuários do sistema imediatamente**, contra as faixas atualizadas — não é preciso esperar a próxima movimentação de pontos de cada um. Excluir um nível com usuários nele não deixa ninguém "órfão": eles são automaticamente redistribuídos pelas faixas restantes na mesma operação.
