# PROMPT — SISTEMA CORPORATIVO DE GAMIFICAÇÃO

Quero desenvolver um **sistema web corporativo de competição e gamificação**, moderno, responsivo e preparado para produção.

O desenvolvimento deve ser feito **fase por fase**. Eu preciso testar e aprovar cada fase antes que você avance para a próxima.

---

## 1. REGRA PRINCIPAL DE DESENVOLVIMENTO

Siga rigorosamente estas regras:

* Desenvolva somente **uma fase por vez**.
* Não avance para a próxima fase sem minha aprovação explícita.
* Ao finalizar uma fase, informe:

  * O que foi desenvolvido;
  * Arquivos criados ou alterados;
  * Banco de dados alterado;
  * APIs criadas ou alteradas;
  * Como executar;
  * Como testar;
  * Critérios de aceite.
* Finalize sempre com:

**FASE X AGUARDANDO APROVAÇÃO.**

* Se eu encontrar um problema, corrija e aguarde uma nova validação.
* Não implemente funcionalidades de fases futuras antecipadamente.
* Não remova funcionalidades já aprovadas.
* Evite soluções temporárias que dificultem a evolução para produção.

---

# 2. OBJETIVO DO SISTEMA

Criar uma plataforma onde funcionários possam participar de **competições e desafios corporativos**, realizar atividades, enviar comprovações, acumular pontos, acompanhar sua evolução e interagir com outros participantes.

Administradores devem conseguir configurar as competições, modalidades, regras, pontuação, validar atividades, acompanhar resultados e administrar premiações.

---

# 3. FUNCIONALIDADES PRINCIPAIS

O sistema deverá possuir:

### Usuários

* Login corporativo;
* Perfil do usuário;
* Foto/avatar;
* Nome, departamento e informações básicas;
* Histórico de atividades;
* Histórico completo de pontos.

### Modalidades

Exemplos:

* Academia;
* Corrida;
* Caminhada;
* Leitura;
* Bicicleta;
* Outras.

As modalidades devem ser **configuráveis**, permitindo criar novas modalidades sem precisar alterar o código principal.

Cada modalidade deverá possuir:

* Nome;
* Descrição;
* Objetivo;
* Regras;
* Forma de pontuação;
* Limites, quando aplicável;
* Necessidade ou não de comprovação.

---

# 4. SISTEMA DE PONTUAÇÃO

A pontuação deve ser dinâmica e configurável.

Exemplos:

* Academia = 20 pontos;
* Corrida = 10 pontos por km;
* Leitura = 30 pontos por livro;
* Desafio concluído = 100 pontos.

Não deixar regras de pontuação fixas diretamente no frontend.

O backend deve ser responsável por calcular e validar os pontos.

## Histórico de pontos

Todo ponto recebido ou removido deve possuir uma origem identificável.

O sistema deve registrar:

* Usuário;
* Quantidade de pontos;
* Data/hora;
* Tipo da movimentação;
* Motivo;
* Atividade relacionada;
* Modalidade;
* Desafio relacionado, quando existir;
* Conquista relacionada, quando existir;
* Usuário responsável pela aprovação ou alteração;
* Registro de origem.

Exemplos de tipos:

* `ACTIVITY`
* `BONUS`
* `PENALTY`
* `ADJUSTMENT`
* `CHALLENGE`
* `ACHIEVEMENT`
* `REWARD`
* `REVERSAL`

**Nunca alterar ou apagar silenciosamente uma pontuação já registrada.**

Correções devem gerar um novo lançamento de ajuste ou reversão, mantendo o histórico.

O usuário deve conseguir entender exatamente:

> "De onde vieram meus pontos?"

---

# 5. ATIVIDADES

O usuário poderá registrar uma atividade.

Exemplo:

> Corrida — 5 km — 50 pontos

Cada atividade deverá possuir:

* Usuário;
* Modalidade;
* Data;
* Quantidade;
* Unidade;
* Descrição;
* Pontuação calculada;
* Status;
* Evidência, quando necessária;
* Data de criação;
* Data de aprovação.

Status sugeridos:

* Pendente;
* Aprovada;
* Rejeitada;
* Cancelada.

---

# 6. COMPROVAÇÃO

Quando uma atividade exigir comprovação, o usuário deverá enviar um arquivo.

Exemplos:

* Foto;
* PDF;
* Documento;
* Comprovante.

Os arquivos **não devem ser armazenados diretamente no banco de dados**.

Utilizar armazenamento de arquivos, como:

* Azure Blob Storage;
* AWS S3;
* ou solução equivalente.

O banco deve armazenar apenas os metadados e a referência do arquivo.

Os arquivos devem possuir acesso privado e controlado.

Administradores autorizados devem conseguir visualizar os arquivos enviados.

---

# 7. APROVAÇÃO

Atividades que exigirem validação deverão passar por um administrador.

O administrador poderá:

* Aprovar;
* Rejeitar;
* Solicitar correção, se aplicável.

Ao aprovar:

1. A atividade passa para `APPROVED`;
2. A pontuação é registrada;
3. A movimentação entra no histórico de pontos;
4. Ranking e indicadores são atualizados;
5. O histórico registra quem aprovou e quando.

Operações críticas devem utilizar transações no banco para evitar inconsistências.

---

# 8. RANKING

Criar ranking dinâmico dos participantes.

Filtros:

* Geral;
* Semana;
* Mês;
* Ano;
* Modalidade;
* Departamento;
* Competição/desafio.

Exibir:

* Posição;
* Usuário;
* Avatar;
* Pontos;
* Evolução;
* Variação de posição.

O ranking deve utilizar os pontos válidos/aprovados como fonte.

---

# 9. NÍVEIS E CONQUISTAS

Criar sistema de progressão.

Exemplos:

* Nível 1 — Iniciante;
* Nível 2 — Participante;
* Nível 3 — Ativo;
* Nível 4 — Destaque.

Criar também conquistas/badges.

Exemplos:

* Primeira atividade;
* 10 atividades realizadas;
* 100 km corridos;
* Primeiro lugar;
* 1.000 pontos acumulados.

As regras devem ser configuráveis sempre que possível.

---

# 10. DESAFIOS

Administradores poderão criar desafios.

Um desafio poderá possuir:

* Nome;
* Descrição;
* Período;
* Modalidade;
* Meta;
* Pontuação;
* Participantes;
* Regras;
* Status.

O sistema deve acompanhar o progresso de cada participante.

---

# 11. PREMIAÇÕES

Criar módulo de recompensas.

Cada recompensa poderá possuir:

* Nome;
* Descrição;
* Imagem;
* Quantidade disponível;
* Critério;
* Pontos necessários;
* Status.

Registrar quando um usuário receber ou resgatar uma recompensa.

---

# 12. REDE SOCIAL / MURAL

Criar um mural interno.

Usuários poderão:

* Publicar mensagens;
* Curtir;
* Comentar;
* Visualizar publicações;
* Interagir com outros participantes.

O mural deve possuir controle de permissões e possibilidade de moderação administrativa.

---

# 13. NOTIFICAÇÕES

Criar sistema de notificações.

Exemplos:

* Atividade aprovada;
* Atividade rejeitada;
* Nova conquista;
* Mudança no ranking;
* Novo desafio;
* Recompensa disponível;
* Mensagem motivacional;
* Usuário ultrapassado no ranking.

As notificações devem ser armazenadas para que o usuário possa consultar seu histórico.

---

# 14. DASHBOARD

Criar dashboard do participante mostrando:

* Pontos atuais;
* Posição no ranking;
* Evolução dos pontos;
* Atividades realizadas;
* Atividades pendentes;
* Conquistas;
* Nível atual;
* Progresso para próximo nível;
* Desafios ativos;
* Recompensas;
* Últimas movimentações de pontos.

---

# 15. ÁREA ADMINISTRATIVA

Administradores devem possuir painel para:

* Gerenciar usuários;
* Gerenciar departamentos;
* Criar modalidades;
* Configurar regras;
* Configurar pontuação;
* Validar atividades;
* Visualizar evidências;
* Criar desafios;
* Gerenciar conquistas;
* Gerenciar recompensas;
* Consultar ranking;
* Consultar histórico de pontos;
* Realizar ajustes de pontuação;
* Visualizar logs/auditoria.

Qualquer alteração administrativa relevante deve possuir registro de auditoria.

---

# 16. BANCO DE DADOS

Utilizar **PostgreSQL**.

Utilizar ORM, preferencialmente **Prisma**.

O banco deve ser estruturado pensando em:

* Integridade;
* Relacionamentos;
* Índices;
* Constraints;
* Performance;
* Auditoria;
* Escalabilidade;
* Histórico.

Entidades principais:

* users
* departments
* roles
* permissions
* user_roles
* activity_types
* activities
* activity_evidence
* points_transactions
* levels
* achievements
* user_achievements
* challenges
* challenge_participants
* rewards
* user_rewards
* posts
* comments
* post_likes
* notifications
* audit_logs

A estrutura pode ser ajustada caso uma modelagem melhor seja identificada durante o desenvolvimento.

---

# 17. ARQUITETURA

Utilizar arquitetura separando:

**Frontend → Backend/API → Banco de Dados**

E, quando necessário:

**Backend → Storage de arquivos**

Sugestão:

### Frontend

* React + TypeScript;
* HTML/CSS moderno;
* Interface responsiva.

### Backend

* Node.js + TypeScript;
* NestJS ou Express;
* API REST.

### Banco

* PostgreSQL;
* Prisma.

### Arquivos

* Azure Blob Storage, AWS S3 ou equivalente.

### Infraestrutura

* Docker;
* Variáveis de ambiente;
* Migrations;
* Seeds.

A arquitetura deve permitir futuramente integração com outros sistemas corporativos.

---

# 18. AUTENTICAÇÃO E SEGURANÇA

Priorizar autenticação corporativa utilizando:

**Microsoft Entra ID / Azure AD**

Não armazenar senhas se a autenticação corporativa estiver disponível.

Implementar:

* Autenticação;
* Autorização;
* Controle por perfil;
* Controle por permissões;
* Proteção das APIs;
* Validação dos dados;
* Controle de acesso aos arquivos;
* Logs;
* Auditoria;
* Proteção contra alterações indevidas de pontos.

O frontend nunca deve ser considerado fonte confiável para regras de negócio.

---

# 19. REGRAS IMPORTANTES

### Fonte da verdade

O backend é responsável por:

* Pontuação;
* Ranking;
* Aprovações;
* Níveis;
* Conquistas;
* Recompensas;
* Permissões.

### Pontuação

Toda alteração de pontos precisa possuir origem.

Nunca criar pontos sem justificativa.

### Auditoria

Operações administrativas importantes devem gerar logs.

### Histórico

Informações históricas não devem ser apagadas de forma que impeça descobrir o que aconteceu.

### Integridade

Operações relacionadas à aprovação e pontuação devem ser atômicas.

Exemplo:

> Aprovar atividade + registrar pontos + atualizar histórico

Deve ocorrer como uma operação consistente.

---

# 20. FASES DE DESENVOLVIMENTO

Desenvolver exatamente nesta ordem:

### FASE 0 — Planejamento

* Arquitetura;
* Tecnologias;
* Estrutura do projeto;
* Modelo inicial de dados;
* Fluxos principais.

### FASE 1 — Banco de Dados

* PostgreSQL;
* Schema;
* Relacionamentos;
* Migrations;
* Seeds.

### FASE 2 — Backend

* API;
* Estrutura;
* ORM;
* Configurações;
* Tratamento de erros.

### FASE 3 — Autenticação

* Login;
* Usuários;
* Perfis;
* Permissões.

### FASE 4 — Modalidades

* CRUD;
* Regras;
* Configurações de pontuação.

### FASE 5 — Pontuação

* Motor de pontuação;
* Ledger/histórico;
* Ajustes;
* Reversões.

### FASE 6 — Atividades

* Registro;
* Cálculo;
* Status;
* Histórico.

### FASE 7 — Evidências

* Upload;
* Storage;
* Visualização;
* Segurança.

### FASE 8 — Aprovação

* Validação administrativa;
* Aprovação/rejeição;
* Geração dos pontos.

### FASE 9 — Auditoria

* Logs;
* Rastreamento das ações.

### FASE 10 — Ranking

* Ranking;
* Filtros;
* Evolução.

### FASE 11 — Níveis

* Progressão;
* Experiência;
* Níveis.

### FASE 12 — Conquistas

* Badges;
* Regras;
* Desbloqueios.

### FASE 13 — Desafios

* Criação;
* Participação;
* Metas;
* Progresso.

### FASE 14 — Recompensas

* Catálogo;
* Resgate;
* Controle.

### FASE 15 — Mural

* Publicações;
* Curtidas;
* Comentários.

### FASE 16 — Notificações

* Eventos;
* Alertas;
* Mensagens motivacionais.

### FASE 17 — Dashboard

* Indicadores;
* Gráficos;
* Evolução.

### FASE 18 — Perfil

* Perfil;
* Avatar;
* Informações pessoais;
* Histórico.

### FASE 19 — Histórico

* Atividades;
* Pontos;
* Origem dos pontos;
* Aprovações;
* Ajustes.

### FASE 20 — Administração

* Dashboard administrativo;
* Gestão geral;
* Indicadores.

### FASE 21 — Regras

* Página de regras;
* Explicação das modalidades;
* Critérios de pontuação.

### FASE 22 — UX/UI

* Responsividade;
* Animações;
* Feedbacks;
* Melhorias de usabilidade.

### FASE 23 — Segurança

* Permissões;
* Validações;
* Proteção das APIs;
* Arquivos;
* Auditoria.

### FASE 24 — Testes

* Testes unitários;
* Testes de integração;
* Testes de API;
* Testes dos principais fluxos.

### FASE 25 — Documentação e Produção

* Documentação;
* README;
* Configuração de ambiente;
* Docker;
* Deploy;
* Variáveis de ambiente;
* Orientações para manutenção.

---

# 21. PADRÃO DE ENTREGA DE CADA FASE

Ao terminar cada fase, responda obrigatoriamente:

### O que foi feito

Resumo objetivo das funcionalidades implementadas.

### Arquivos

Lista dos arquivos criados ou alterados.

### Banco de dados

Informar tabelas, campos, migrations e alterações realizadas.

### APIs

Informar endpoints criados ou alterados.

### Como executar

Comandos necessários.

### Como testar

Passo a passo para validar a funcionalidade.

### Critérios de aceite

Lista objetiva do que precisa funcionar para considerar a fase aprovada.

### Status

**FASE X AGUARDANDO APROVAÇÃO**

Não avance até que eu responda explicitamente que a fase foi aprovada.

---

# 22. PRIMEIRA EXECUÇÃO

Comece **somente pela FASE 0 — Planejamento**.

Não implemente funcionalidades das próximas fases.

Na FASE 0, entregue:

1. Arquitetura proposta;
2. Tecnologias escolhidas;
3. Estrutura de pastas;
4. Modelo inicial do banco;
5. Principais entidades e relacionamentos;
6. Fluxo do usuário;
7. Fluxo administrativo;
8. Fluxo de pontuação;
9. Fluxo de aprovação;
10. Estratégia para histórico de pontos;
11. Estratégia para armazenamento de evidências;
12. Estratégia de autenticação;
13. Critérios de aceite da FASE 0.

Depois finalize com:

**FASE 0 AGUARDANDO APROVAÇÃO.**

Aguarde minha aprovação antes de continuar.
