# Documentação Funcional do Sistema

Este diretório documenta **como cada seção do sistema funciona de fato**, com base no código-fonte (não no planejamento original) — regras de negócio, fluxos, quem pode fazer o quê, e o que acontece em cada caso de borda. É complementar aos documentos técnicos em `docs/` (arquitetura, modelo de dados, API, deploy): lá está o "como foi construído"; aqui está o "como se comporta".

## Regra permanente desta pasta

**Toda vez que uma funcionalidade for criada, alterada ou corrigida, o arquivo correspondente aqui deve ser atualizado no mesmo commit.** Isso vale tanto para uma mudança de comportamento (ex.: uma regra de negócio nova) quanto para uma correção de bug que muda o que o usuário via antes. Documentação desatualizada é pior do que nenhuma documentação — ela engana.

Ao adicionar uma seção nova ao sistema, crie um arquivo novo aqui e adicione-o à tabela abaixo.

## Índice

| Arquivo | Seção do sistema |
|---|---|
| [usuarios-e-acesso.md](./usuarios-e-acesso.md) | Contas, autenticação, cadastro, papéis (RBAC), departamentos |
| [atividades.md](./atividades.md) | Modalidades, registro de atividades, evidências, aprovação/rejeição |
| [pontuacao.md](./pontuacao.md) | Motor de pontuação, ledger imutável, todos os tipos de transação |
| [niveis.md](./niveis.md) | Níveis de progressão e reclassificação automática |
| [conquistas.md](./conquistas.md) | Badges/conquistas, os 8 tipos de critério, motor de desbloqueio |
| [desafios.md](./desafios.md) | Desafios com meta e prazo, progresso, ranking por desafio |
| [ciclos.md](./ciclos.md) | Ciclos de premiação periódicos, pódio, reset geral de pontuação |
| [eventos.md](./eventos.md) | Eventos comunitários propostos por usuários, aprovação, presença |
| [recompensas.md](./recompensas.md) | Catálogo de prêmios, resgate, aprovação/entrega/cancelamento |
| [ranking-e-participantes.md](./ranking-e-participantes.md) | Ranking dinâmico e a seção "Participantes" (perfil entre colegas) |
| [notificacoes.md](./notificacoes.md) | Central de notificações — os 15 tipos e onde cada um aparece |
| [mural.md](./mural.md) | Mural social (posts, comentários, curtidas) e grupos de evento |
| [auditoria.md](./auditoria.md) | Trilha de auditoria administrativa |
| [perfil.md](./perfil.md) | Meu Perfil, avatar, dados pessoais, e o perfil visto por colegas |

## Conceitos transversais (valem para o sistema inteiro)

Estes princípios aparecem repetidos em quase todo arquivo acima porque são regras de arquitetura, não de uma seção isolada:

1. **O backend é a única fonte da verdade.** O frontend nunca calcula pontos, decide aprovações, ou resolve rankings — ele só envia a intenção (`activityTypeId` + `quantity`, por exemplo) e mostra o que o backend devolve.
2. **O ledger de pontos (`points_transactions`) é imutável.** Nenhuma linha é jamais alterada ou apagada. Toda correção é um novo lançamento (`REVERSAL`, `ADJUSTMENT`, `CYCLE_RESET`...) que aponta pra quem ele corrige. `User.totalPoints` é sempre a soma dessas linhas — nunca editado direto.
3. **Nada com histórico é excluído de verdade.** Conquista, desafio, prêmio ou departamento já usados/concedidos nunca somem do banco — são desativados/cancelados (status muda), preservando a integridade do que já aconteceu. Só é possível excluir de fato algo que nunca teve uso.
4. **Fluxos multi-etapa rodam em uma única transação de banco (ACID).** Aprovar uma atividade, por exemplo, muda o status, credita pontos, reavalia nível, verifica conquistas, atualiza desafios e notifica — tudo ou nada, nunca pela metade.
5. **"Quem decide" nunca é "quem se beneficia".** Um usuário nunca aprova a própria atividade, define a própria pontuação de bônus de evento, ou aprova o próprio cadastro — sempre exige um administrador.
6. **Toda ação administrativa relevante fica na auditoria (`audit_logs`).** Ver [auditoria.md](./auditoria.md).
