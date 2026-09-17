# Atividades e Modalidades

## Modalidades (`ActivityType`)

Cadastro administrável (`ADMIN`/`ADMIN_MASTER`) que define **como uma atividade pontua**. Cada modalidade tem:

- **Categoria**: `SPORTS`, `HEALTH`, `EDUCATION`, `SOCIAL`, `OTHER`.
- **Tipo de pontuação** (`scoringType`) — ver [pontuacao.md](./pontuacao.md) para a fórmula exata de cada um: `FIXED`, `QUANTITY`, `TIME`, `MULTIPLIER`.
- **`basePoints`** e **`multiplier`**: parâmetros da fórmula acima.
- **Limites** opcionais: `dailyLimit`, `weeklyLimit`, `monthlyLimit` — número máximo de **atividades (registros)** aprovadas dessa modalidade que um usuário pode ter no período. Sem limite configurado, não há restrição. **Importante**: é uma contagem de registros, não uma soma de `quantity` — um limite diário de 30, por exemplo, permite no máximo 30 *atividades* de Corrida naquele dia, não 30 km somados; uma única atividade pode ter qualquer `quantity`. Na tela de edição de modalidade (Admin > Modalidades), deixar um desses três campos em branco remove o limite existente (envia `null`); deixar em branco só na criação simplesmente nasce sem limite.
- **`requiresEvidence`**: se `true`, a atividade só pode ser aprovada com pelo menos um arquivo de evidência anexado.
- **`allowedFileTypes`**: lista de extensões aceitas para evidência daquela modalidade especificamente.
- **`status`**: `ACTIVE`/`INACTIVE` — uma modalidade inativa não aceita novos registros, mas o histórico de atividades já registradas nela continua intacto.

Excluir uma modalidade sem nenhuma atividade vinculada apaga de verdade; havendo histórico, vira soft-delete (`INACTIVE`).

## Modalidades do seed e a recalibragem por esforço físico

Os valores abaixo refletem o seed atual (`backend/prisma/seed.ts`) — cada modalidade é livremente editável por um admin depois, então isto é o ponto de partida, não uma regra imutável.

| Modalidade | `scoringType` | Taxa | `dailyLimit` (registros/dia) | Evidência |
|---|---|---|---|---|
| Academia & Musculação | `FIXED` | 20 pts/sessão | 1 | Sim |
| Corrida de Rua / Esteira | `QUANTITY` | 8 pts/km | 30 | Sim |
| Caminhada | `QUANTITY` | 5 pts/km | 20 | Sim |
| Ciclismo | `QUANTITY` | 3 pts/km | 80 | Sim |
| Leitura de Livros | `MULTIPLIER` | 0,1 pt/página | 5 | Sim |
| Meditação & Mindfulness | `FIXED` | 15 pts/sessão | 2 | Não |

Corrida/Caminhada/Ciclismo foram recalibradas por **esforço físico real**, não só por percepção: usando MET (Equivalente Metabólico, referência de educação física/saúde ocupacional) dividido pela velocidade média de cada modalidade como proxy de "esforço por km", ancorando Caminhada em 5 pts/km (valor já existente antes da recalibragem):

- **Ciclismo caiu de 5 para 3 pts/km** — pedalar exige bem menos esforço por km do que caminhar ou correr (é a distorção original que motivou a recalibragem: antes, Ciclismo permitia mais pontos no teto diário do que Corrida, apesar de ser a modalidade mais fácil das três).
- **Corrida caiu de 10 para 8 pts/km** — por km (não por minuto), correr não exige muito mais esforço fisiológico do que caminhar; a vantagem de quem corre já vem naturalmente de percorrer mais km no mesmo tempo, não precisa de uma taxa por km desproporcional.

**Leitura de Livros deixou de pontuar por livro concluído (`FIXED`, 30 pts fixos) e passou a pontuar por página lida** (`MULTIPLIER`, 0,1 pt/página — 300 páginas ≈ 30 pts, mantendo equivalência com o valor antigo para um livro médio), registrada de forma incremental por sessão (a pessoa registra o progresso conforme lê, não só quando termina o livro) — dá crédito por leitura parcial em livros longos e livros maiores naturalmente valem mais que livros curtos.

`dailyLimit: 5` na Leitura é **5 registros de sessão de leitura por dia**, não "5 páginas" — mesma ressalva da nota sobre limites acima: não existe hoje uma forma de capar a *soma* de páginas (ou km) por dia, só a *contagem* de registros.

## Ciclo de vida de uma atividade registrada (`UserActivity`)

```
[Participante registra] → status PENDING (pontos calculados como PREVISÃO, nada creditado ainda)
        ↓
[Participante anexa evidência, se a modalidade exigir]
        ↓
[Aprovação — admin OU automática, ver seção abaixo] ──→  status APPROVED, pontos creditados no ledger (ver pontuacao.md)
        │
        └─ [Admin rejeita, com motivo obrigatório] → status REJECTED, nenhum ponto
```

- Ao **registrar**, o backend já calcula `calculatedPoints` (mesma fórmula da aprovação) só para exibir uma prévia — isso **não** cria transação no ledger nem altera o saldo do usuário por si só. O crédito oficial só acontece na aprovação (manual ou automática — ver seção abaixo).
- Os limites diário/semanal/mensal da modalidade são checados **no momento do registro** (contando apenas atividades já `APPROVED` no período) — se estourado, o registro é bloqueado com 422 antes mesmo de chegar à fila do admin (ou de ser auto-aprovado).
- Evidências podem ser enviadas em qualquer atividade que não esteja `REJECTED` ou `CANCELLED` — incluindo uma atividade já `APPROVED` (evidência é sempre opcional depois da aprovação; existe principalmente para permitir anexar depois de uma modalidade que não exige evidência mas foi auto-aprovada na hora do registro). Só fica bloqueado enviar evidência para uma atividade já avaliada negativamente.
- Só o autor da atividade pode enviar evidência para ela; só o autor (ou um admin) pode visualizar os detalhes/arquivos.
- **Aprovar exige evidência já anexada, se a modalidade exigir** — mesmo que o formulário de registro tenha deixado passar, a aprovação recusa (`EVIDENCE_REQUIRED`) sem nenhuma evidência no banco. Isso vale tanto pra aprovação manual quanto pra automática.
- Uma atividade só pode ser avaliada (aprovada/rejeitada) uma única vez — tentar avaliar de novo uma que já saiu de `PENDING` retorna erro (`ACTIVITY_ALREADY_EVALUATED`).

## Aprovação automática (`SystemSetting: AUTO_APPROVE_ACTIVITIES`)

Por padrão, o sistema **aprova atividades automaticamente**, sem esperar nenhuma ação de admin — assim que todos os critérios de aprovação já estiverem satisfeitos:

- **Modalidade sem evidência exigida** (`requiresEvidence: false`): aprovada instantaneamente no próprio `POST /activities`, na mesma resposta HTTP — o participante já recebe a atividade com `status: "APPROVED"` e os pontos já creditados.
- **Modalidade com evidência exigida** (`requiresEvidence: true`): a atividade nasce `PENDING` como sempre (não há evidência ainda no momento do registro) e só é aprovada automaticamente **depois** que a primeira evidência é enviada com sucesso (`POST /activities/:id/evidence`) — nunca antes, porque aprovar sem evidência violaria a regra acima.
- Em ambos os casos, a aprovação automática dispara **exatamente a mesma cadeia de efeitos** de uma aprovação manual (crédito de pontos, nível, conquistas, desafios, notificação, auditoria) — só muda quem é o responsável.
- Auditoria (`AuditLog`) e o campo `UserActivity.validatedBy` registram a aprovação automática com **`userId`/responsável `null`** (ação `AUTO_APPROVE_ACTIVITY`, em vez de `APPROVE_ACTIVITY`) — ou seja, fica permanentemente registrado que nenhum humano decidiu aquela aprovação. A notificação ao participante também usa uma frase diferente ("foi aprovada automaticamente").

**Isso é intencionalmente uma exceção à "Regra de Ouro" do sistema** ("quem decide nunca é quem se beneficia") — por isso é controlado por um interruptor único, global, auditável e reversível, não por comportamento fixo no código:

- Configurável em **Admin → Configurações** (`/admin/configuracoes`, visível e editável só por `ADMIN_MASTER`; um `ADMIN` comum pode ler o valor atual mas não alterá-lo — `GET /settings` vs `PATCH /settings`).
- É um único switch **global**, vale para todas as modalidades ao mesmo tempo (não existe auto-aprovação por modalidade).
- Ao ser **desativado**, o sistema volta 100% ao fluxo manual de sempre: toda atividade fica `PENDING` até um admin aprovar ou rejeitar pela fila em `/admin/aprovacoes`, exatamente como se a funcionalidade nunca tivesse existido.
- Guardado na tabela genérica `system_settings` (chave/valor), pensada para acomodar futuras configurações sem precisar de nova migration a cada uma.

## O que a aprovação dispara (tudo em uma única transação atômica)

Vale igual para aprovação manual (por um admin) e automática (ver seção acima) — só muda quem/o quê fica registrado como responsável:

1. Status → `APPROVED`, registra quem aprovou e quando (`null` quando foi automática).
2. Credita os pontos no ledger (`transactionType = ACTIVITY`) — ver [pontuacao.md](./pontuacao.md).
3. Reclassifica o nível do usuário, se aplicável ([niveis.md](./niveis.md)).
4. Verifica e desbloqueia conquistas, se aplicável ([conquistas.md](./conquistas.md)).
5. Atualiza o progresso de qualquer desafio ativo que case com a modalidade ([desafios.md](./desafios.md)).
6. Notifica o participante (`ACTIVITY_APPROVED`) e, se ele subiu no ranking geral por causa disso, uma segunda notificação (`RANKING_UP`).
7. Grava entrada de auditoria (`APPROVE_ACTIVITY` se manual, `AUTO_APPROVE_ACTIVITY` se automática).

A rejeição só muda o status para `REJECTED`, grava o motivo, audita (`REJECT_ACTIVITY`) e notifica (`ACTIVITY_REJECTED`) — nenhum ponto é tocado.

## Evidências (`ActivityEvidence`)

- Armazenadas via `StorageProvider` (local em disco, ou Cloudinary em produção sem disco persistente) — o banco guarda só metadados (nome, tipo, tamanho, caminho de armazenamento), nunca o binário.
- **Nunca expostas por URL direta**: todo download passa por um endpoint autorizado que confere se quem pede é o dono da atividade ou um admin.
- Validação de extensão e tamanho máximo (`MAX_UPLOAD_SIZE_MB`) antes de salvar.

## Visibilidade

Um participante só vê e lista as próprias atividades — nunca as de outro colega (diferente do perfil, que hoje expõe atividades recentes entre colegas; ver [ranking-e-participantes.md](./ranking-e-participantes.md)). Um admin vê e filtra por qualquer usuário.
