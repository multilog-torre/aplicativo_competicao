# PROMPT MESTRE — SISTEMA CORPORATIVO DE COMPETIÇÃO E GAMIFICAÇÃO

## 1. INSTRUÇÃO PRINCIPAL

Você deverá desenvolver uma plataforma web corporativa de competição, desafios e gamificação entre colaboradores.

O desenvolvimento deverá ser realizado **OBRIGATORIAMENTE POR FASES**, seguindo a ordem definida neste documento.

### REGRA FUNDAMENTAL

**NÃO AVANCE PARA A PRÓXIMA FASE SEM MINHA APROVAÇÃO EXPLÍCITA DA FASE ATUAL.**

Ao finalizar uma fase:

1. Informe o que foi desenvolvido.
2. Informe os arquivos criados ou alterados.
3. Informe as funcionalidades implementadas.
4. Informe alterações no banco de dados.
5. Informe APIs criadas.
6. Informe como testar.
7. Apresente os critérios de aceite da fase.
8. Aguarde minha validação.

Eu farei os testes.

Somente quando eu responder algo como:

> "Fase aprovada"

ou

> "Pode avançar para a próxima fase"

você poderá iniciar a fase seguinte.

Se eu informar problemas:

* Não avance.
* Corrija os problemas.
* Execute novamente os testes necessários.
* Aguarde nova aprovação.

---

# 2. OBJETIVO DO SISTEMA

Criar uma plataforma de competição corporativa na qual colaboradores possam realizar atividades e acumular pontos.

Exemplos de modalidades:

* Academia
* Corrida
* Caminhada
* Leitura
* Ciclismo
* Meditação
* Esportes
* Estudos
* Outras modalidades configuráveis

O administrador poderá criar novas modalidades sem precisar alterar o código da aplicação.

O ciclo principal será:

```text
ENTRAR
   ↓
ESCOLHER MODALIDADE
   ↓
REALIZAR ATIVIDADE
   ↓
REGISTRAR ATIVIDADE
   ↓
ENVIAR EVIDÊNCIA
   ↓
AGUARDAR VALIDAÇÃO
   ↓
ADMINISTRADOR APROVA
   ↓
PONTOS SÃO CREDITADOS
   ↓
RANKING É ATUALIZADO
   ↓
CONQUISTAS SÃO VERIFICADAS
   ↓
NÍVEL É ATUALIZADO
   ↓
DESAFIOS SÃO ATUALIZADOS
   ↓
USUÁRIO RECEBE NOTIFICAÇÃO
```

---

# 3. ARQUITETURA

Utilizar arquitetura separada:

```text
Frontend
    ↓
Backend / API
    ↓
Banco de dados
    ↓
Storage de arquivos
```

### Frontend

Responsável por:

* Interface.
* Navegação.
* Formulários.
* Gráficos.
* Ranking.
* Dashboard.
* Interações.

### Backend

Responsável por:

* Regras de negócio.
* Autenticação.
* Autorização.
* Pontuação.
* Validação.
* Ranking.
* Conquistas.
* Desafios.
* Notificações.
* Auditoria.

### Banco

Responsável por:

* Persistência.
* Relacionamentos.
* Integridade.
* Histórico.

### Storage

Responsável por:

* Fotos.
* Evidências.
* Avatares.
* Arquivos do mural.

---

# 4. STACK

Caso não exista uma stack previamente definida, utilizar:

### Frontend

* React
* TypeScript
* HTML5
* CSS3

### Backend

* Node.js
* TypeScript
* NestJS ou Express
* API REST

### Banco

* PostgreSQL

### ORM

* Prisma ou equivalente

### Storage

Preferencialmente:

* Azure Blob Storage

A arquitetura deve permitir futuramente utilizar outro storage.

### Infraestrutura

* Docker
* Docker Compose para desenvolvimento
* Variáveis de ambiente
* Estrutura preparada para deploy

---

# 5. PRINCÍPIOS DE DESENVOLVIMENTO

Seguir os princípios:

### 5.1 Backend é a fonte oficial

O frontend nunca poderá determinar:

* Pontuação.
* Ranking.
* Aprovação.
* Nível.
* Conquista.
* Premiação.
* Permissão.

### 5.2 Banco é persistente

Não utilizar apenas:

* localStorage
* sessionStorage
* dados fixos em JavaScript

como armazenamento definitivo.

### 5.3 Código modular

Separar:

* Controllers
* Services
* Repositories
* Models
* DTOs
* Guards/Middlewares
* Components
* Pages
* Services frontend

### 5.4 Segurança

Nunca colocar:

* Senhas.
* Secrets.
* Tokens.
* Chaves privadas.

diretamente no código.

---

# FASE 0 — PLANEJAMENTO E ESTRUTURA INICIAL

## Objetivo

Preparar o projeto antes de desenvolver funcionalidades.

## Criar

Estrutura:

```text
/frontend
/backend
/database
/storage
/docs
```

Criar:

* README.
* `.env.example`
* Docker.
* Configuração inicial.
* Gitignore.
* Estrutura base frontend.
* Estrutura base backend.

## Não criar ainda

Não implementar:

* Ranking.
* Pontuação.
* Atividades.
* Mural.
* Gamificação.

Apenas a infraestrutura inicial.

## Testes

Verificar:

* Frontend inicia.
* Backend inicia.
* Banco inicia.
* Comunicação básica funciona.
* Variáveis de ambiente funcionam.

### CRITÉRIO DE ACEITE

A infraestrutura básica deve funcionar sem erros.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 1 — BANCO DE DADOS

## Objetivo

Criar a estrutura definitiva inicial do banco.

Utilizar PostgreSQL.

## Tabelas iniciais

### users

```text
id
corporate_id
email
name
department_id
position
avatar_type
avatar_url
status
created_at
updated_at
```

### departments

```text
id
name
description
status
created_at
updated_at
```

### roles

```text
id
name
description
```

### permissions

```text
id
name
description
```

### user_roles

```text
user_id
role_id
```

### role_permissions

```text
role_id
permission_id
```

---

## MODALIDADES

Criar:

```text
activity_types
```

Campos:

```text
id
name
description
category
icon
rules_description
scoring_type
base_points
unit
multiplier
daily_limit
weekly_limit
monthly_limit
requires_evidence
allowed_file_types
status
created_at
updated_at
```

---

# 6. ATIVIDADES

Criar:

```text
user_activities
```

Campos:

```text
id
user_id
activity_type_id
activity_date
quantity
unit
description
calculated_points
status
submitted_at
validated_at
validated_by
rejection_reason
created_at
updated_at
```

Status:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

---

# 7. EVIDÊNCIAS

Criar:

```text
activity_evidence
```

Campos:

```text
id
activity_id
file_name
file_type
file_size
storage_provider
storage_path
storage_url
uploaded_by
created_at
```

O arquivo físico não deverá ser armazenado no PostgreSQL.

---

# 8. HISTÓRICO OFICIAL DE PONTOS

## REGRA FUNDAMENTAL

A pontuação deverá possuir histórico detalhado.

**Nunca depender somente de `users.total_points`.**

Criar:

```text
points_transactions
```

Campos:

```text
id
user_id
activity_id
challenge_id
achievement_id
reward_id
transaction_type
points
description
reference_type
reference_id
created_by
created_at
```

### transaction_type

Possíveis valores:

```text
ACTIVITY
BONUS
PENALTY
ADJUSTMENT
CHALLENGE
ACHIEVEMENT
REWARD
REVERSAL
```

---

# 9. COMO FUNCIONARÁ O HISTÓRICO DE PONTOS

Exemplo:

```text
Renan
│
├── Corrida 5 km
│   +50 pontos
│   01/09/2026
│
├── Academia
│   +20 pontos
│   02/09/2026
│
├── Desafio semanal
│   +100 pontos
│   05/09/2026
│
├── Conquista "10 atividades"
│   +50 pontos
│   06/09/2026
│
└── Ajuste administrativo
    -20 pontos
    07/09/2026
```

Total:

```text
200 pontos
```

O sistema deverá permitir identificar:

* De onde veio o ponto.
* Qual atividade gerou o ponto.
* Qual modalidade.
* Qual desafio.
* Qual conquista.
* Quem realizou eventual ajuste.
* Quando ocorreu.
* Quantos pontos foram adicionados/removidos.
* Motivo.

---

# 10. REGRA DE OURO DO HISTÓRICO

**Nunca apagar silenciosamente uma transação de pontos.**

Se um erro precisar ser corrigido:

Não fazer:

```text
UPDATE points_transactions
SET points = 0
```

sem histórico.

Preferir criar uma transação de reversão:

```text
REVERSAL
-50 pontos
```

e registrar o motivo.

Caso um administrador ajuste pontos:

```text
ADJUSTMENT
+30 pontos
```

com:

* Administrador responsável.
* Motivo.
* Data.
* Referência.

Isso permitirá auditoria completa.

---

# 11. ÍNDICES E CONSTRAINTS

Criar índices para:

```text
users.email
users.corporate_id
user_activities.user_id
user_activities.activity_type_id
user_activities.status
user_activities.activity_date
points_transactions.user_id
points_transactions.created_at
```

Criar constraints para evitar:

* Duplicidade.
* Relacionamentos inválidos.
* Pontuações inconsistentes.
* Registros órfãos.

---

# 12. MIGRATIONS

Utilizar migrations.

O banco deverá conseguir ser criado do zero através do projeto.

Criar seed com:

* Administrador.
* Usuários fictícios.
* Departamentos.
* Modalidades.
* Dados iniciais.

## Testes da FASE 1

Validar:

* Banco inicia.
* Migrations funcionam.
* Tabelas existem.
* Foreign Keys funcionam.
* Constraints funcionam.
* Seed funciona.
* Histórico de pontos suporta diferentes origens.

### CRITÉRIO DE ACEITE

Banco criado e funcional.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 2 — BACKEND BASE

## Objetivo

Criar a estrutura da API.

Criar:

```text
/api/v1
```

Implementar:

* Configuração.
* Controllers.
* Services.
* DTOs.
* Validação.
* Tratamento de erros.
* Logs.
* Swagger/OpenAPI.

Criar resposta padronizada:

```json
{
  "success": true,
  "data": {}
}
```

Erros:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem."
  }
}
```

## Testes

Criar endpoint:

```text
GET /api/v1/health
```

Retornar:

```text
API funcionando
```

### CRITÉRIO DE ACEITE

API funcionando e documentação acessível.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 3 — AUTENTICAÇÃO E AUTORIZAÇÃO

## Objetivo

Implementar acesso ao sistema.

Preparar integração com autenticação corporativa.

Preferencialmente:

```text
Microsoft Entra ID / Azure AD
```

Criar:

* Login.
* Logout.
* Sessão/token.
* Usuário atual.
* Roles.
* Permissions.

Endpoints:

```text
GET /api/v1/auth/me
POST /api/v1/auth/logout
```

Criar proteção:

```text
PARTICIPANTE
ADMIN
ADMIN_MASTER
```

## Testes

Validar:

* Usuário consegue entrar.
* Usuário comum não acessa admin.
* Admin acessa admin.
* Usuário consegue consultar próprio perfil.

### CRITÉRIO DE ACEITE

Controle de acesso funcionando.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 4 — MODALIDADES

## Objetivo

Permitir gerenciamento das modalidades.

Criar CRUD:

```text
GET
POST
PATCH
DELETE
```

Endpoints:

```text
/api/v1/activity-types
```

Administrador poderá:

* Criar.
* Editar.
* Desativar.
* Definir regras.
* Definir pontuação.
* Definir necessidade de evidência.
* Definir limites.

## Testes

Criar:

```text
Academia
Corrida
Leitura
```

Depois criar uma nova modalidade:

```text
Ciclismo
```

sem modificar o código.

### CRITÉRIO DE ACEITE

Modalidades configuráveis.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 5 — MOTOR DE PONTUAÇÃO

## Objetivo

Criar o mecanismo responsável pelo cálculo oficial.

Suportar:

### FIXED

```text
1 atividade = 20 pontos
```

### QUANTITY

```text
5 km = 50 pontos
```

### TIME

```text
30 minutos = 30 pontos
```

### MULTIPLIER

```text
quantidade × multiplicador
```

O cálculo deverá ocorrer exclusivamente no backend.

## Exemplo

Usuário envia:

```text
Corrida
7,5 km
```

Backend calcula:

```text
7,5 / 5 × 50
= 75 pontos
```

O frontend não poderá enviar:

```text
points: 75
```

como valor oficial.

---

# 6.1 — TRANSAÇÃO DE PONTOS

Quando uma atividade for aprovada:

```text
atividade
    ↓
calcular pontos
    ↓
criar points_transaction
    ↓
atualizar total agregado
    ↓
auditoria
```

Utilizar transação de banco.

## Testes

Criar atividades com:

* 1 unidade.
* 5 unidades.
* Quantidade decimal.
* Valor inválido.
* Limite excedido.

### CRITÉRIO DE ACEITE

Cálculo correto e histórico criado.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 7 — REGISTRO DE ATIVIDADES

Criar:

```text
POST /api/v1/activities
GET /api/v1/activities
GET /api/v1/activities/:id
```

Usuário poderá:

* Escolher modalidade.
* Informar data.
* Informar quantidade.
* Adicionar descrição.
* Enviar evidência.

Status inicial:

```text
PENDING
```

Não adicionar pontos ainda.

### CRITÉRIO DE ACEITE

Usuário consegue registrar atividade corretamente.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 8 — UPLOAD E EVIDÊNCIAS

Criar integração com storage.

Fluxo:

```text
Usuário
 ↓
Upload
 ↓
Backend valida
 ↓
Storage
 ↓
Metadados no banco
 ↓
Atividade vinculada
```

Validar:

* Extensão.
* MIME type.
* Tamanho.
* Usuário.
* Atividade.

Permitir:

* JPG
* PNG
* PDF
* TXT

conforme configuração da modalidade.

## Segurança

Arquivos devem ser privados.

O acesso deverá ocorrer através de autorização do backend e URLs temporárias quando necessário.

### CRITÉRIO DE ACEITE

Upload, armazenamento e visualização funcionando.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 9 — VALIDAÇÃO ADMINISTRATIVA

Criar painel de atividades pendentes.

Endpoint:

```text
GET /api/v1/admin/activities/pending
```

Criar:

```text
POST /api/v1/admin/activities/:id/approve
POST /api/v1/admin/activities/:id/reject
```

Ao aprovar:

```text
PENDING
 ↓
APPROVED
 ↓
points_transaction
 ↓
atualização dos pontos
```

Ao rejeitar:

```text
PENDING
 ↓
REJECTED
```

Exigir motivo.

## CRITÉRIO DE ACEITE

Aprovação e rejeição funcionando.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 10 — AUDITORIA

Criar:

```text
audit_logs
```

Registrar:

* Aprovações.
* Rejeições.
* Ajustes de pontos.
* Alterações de modalidade.
* Alterações de regras.
* Alterações de premiações.
* Exclusões/moderações.
* Ações administrativas.

Cada registro deverá identificar:

```text
quem
o quê
quando
qual registro
valor anterior
novo valor
```

### CRITÉRIO DE ACEITE

Toda operação crítica possui rastreabilidade.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 11 — RANKING

Criar ranking baseado no histórico oficial de pontos.

Nunca confiar no ranking armazenado apenas no frontend.

Criar:

```text
GET /api/v1/ranking
```

Filtros:

* Geral.
* Semana.
* Mês.
* Ano.
* Modalidade.
* Departamento.

Mostrar:

* Posição.
* Avatar.
* Nome.
* Pontos.
* Evolução.

Criar regra para empates.

### CRITÉRIO DE ACEITE

Ranking muda automaticamente após aprovação de atividades.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 12 — NÍVEIS

Criar:

```text
levels
```

Exemplo:

```text
Iniciante      0
Explorador     500
Competidor     1000
Destaque       2500
Campeão        5000
```

O administrador poderá configurar.

Mostrar:

```text
850 / 1000 pontos
```

### CRITÉRIO DE ACEITE

Nível atualizado automaticamente.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 13 — CONQUISTAS

Criar:

```text
achievements
user_achievements
```

Exemplos:

* Primeira atividade.
* Primeira corrida.
* 10 atividades.
* 1.000 pontos.
* 7 dias consecutivos.
* Top 3.

O backend deverá verificar conquistas automaticamente.

### CRITÉRIO DE ACEITE

Conquistas desbloqueadas automaticamente.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 14 — DESAFIOS

Criar:

```text
challenges
challenge_participants
challenge_activities
```

Permitir:

* Individual.
* Equipe.
* Departamento.
* Geral.

Exemplo:

```text
100 km no mês
```

Mostrar progresso.

### CRITÉRIO DE ACEITE

Desafios funcionais e progresso correto.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 15 — PREMIAÇÕES

Criar:

```text
rewards
user_rewards
```

Permitir:

* Criar prêmio.
* Definir critério.
* Definir período.
* Definir quantidade.
* Registrar conquista.
* Registrar resgate.

### CRITÉRIO DE ACEITE

Premiações funcionando.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 16 — MURAL SOCIAL

Criar:

```text
posts
comments
post_likes
```

Permitir:

* Criar publicação.
* Inserir foto.
* Curtir.
* Comentar.
* Excluir própria publicação.
* Moderar conteúdo.

### CRITÉRIO DE ACEITE

Mural funcional.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 17 — NOTIFICAÇÕES

Criar:

```text
notifications
```

Gerar automaticamente:

* Atividade aprovada.
* Atividade rejeitada.
* Pontos recebidos.
* Subida no ranking.
* Novo nível.
* Nova conquista.
* Desafio.
* Premiação.

Criar contador de não lidas.

### CRITÉRIO DE ACEITE

Notificações geradas pelos eventos corretos.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 18 — DASHBOARD

Somente após os módulos anteriores estarem funcionando.

Criar Dashboard completo com:

## Minha pontuação

```text
1.250 pontos
```

## Ranking

```text
5º lugar
```

## Nível

```text
Competidor
```

## Progresso

```text
1.250 / 2.500
```

## Atividades

Mostrar últimas atividades.

## Gráficos

* Evolução de pontos.
* Atividades por modalidade.
* Evolução no ranking.
* Desempenho por período.

## Mensagem dinâmica

Exemplo:

> "🔥 Você está a apenas 80 pontos do 4º colocado!"

### CRITÉRIO DE ACEITE

Dashboard funcionando com dados reais vindos da API.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 19 — PERFIL E AVATAR

Criar:

* Perfil.
* Foto.
* Avatar.
* Conquistas.
* Pontuação.
* Histórico.
* Ranking.

Permitir:

* Upload de foto.
* Seleção de avatar.

### CRITÉRIO DE ACEITE

Perfil funcionando.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 20 — HISTÓRICO DO USUÁRIO

Criar tela:

```text
Meu histórico
```

Mostrar:

| Data | Atividade | Pontos | Status |
| ---- | --------- | ------ | ------ |

Criar também:

## Histórico de pontos

| Data  | Origem   | Descrição | Pontos |
| ----- | -------- | --------- | ------ |
| 01/09 | Corrida  | 5 km      | +50    |
| 02/09 | Academia | Atividade | +20    |
| 05/09 | Desafio  | Bônus     | +100   |

Permitir clicar na transação e visualizar sua origem.

Exemplo:

```text
+50 pontos

Origem:
Corrida

Atividade:
ID XXXXX

Data:
01/09/2026

Quantidade:
5 km

Aprovado por:
Administrador

Data da aprovação:
01/09/2026 18:32
```

Essa funcionalidade é obrigatória.

### CRITÉRIO DE ACEITE

O usuário consegue identificar exatamente de onde veio cada ponto.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 21 — PAINEL ADMINISTRATIVO

Criar:

```text
Admin Dashboard
```

Indicadores:

* Total de usuários.
* Usuários ativos.
* Atividades.
* Pendências.
* Pontos distribuídos.
* Modalidade mais praticada.
* Ranking.
* Desafios.
* Premiações.

Criar gráficos.

### CRITÉRIO DE ACEITE

Administrador consegue acompanhar o sistema.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 22 — REGRAS DO JOGO

Criar página dinâmica:

```text
Como funciona?
```

Mostrar:

1. Escolha a modalidade.
2. Faça a atividade.
3. Registre.
4. Envie evidência.
5. Aguarde aprovação.
6. Receba pontos.
7. Suba no ranking.
8. Conquiste premiações.

As regras deverão vir do backend.

Não deixar textos críticos fixos apenas no frontend.

### CRITÉRIO DE ACEITE

Regras claras e configuráveis.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 23 — RESPONSIVIDADE E UX

Garantir funcionamento em:

* Desktop.
* Notebook.
* Tablet.
* Celular.

Revisar:

* Menu.
* Cards.
* Formulários.
* Ranking.
* Tabelas.
* Upload.
* Gráficos.
* Mural.

Adicionar:

* Loading.
* Empty states.
* Error states.
* Toasts.
* Modais.
* Confirmações.

### CRITÉRIO DE ACEITE

Aplicação utilizável em diferentes tamanhos de tela.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 24 — SEGURANÇA

Executar revisão completa.

Verificar:

* Autenticação.
* Autorização.
* Roles.
* Permissões.
* Upload.
* Storage.
* API.
* SQL Injection.
* CORS.
* Rate limiting.
* Secrets.
* Tokens.
* Auditoria.

Garantir que:

```text
PARTICIPANTE
≠
ADMINISTRADOR
```

e que um participante nunca consiga:

* Alterar pontos.
* Aprovar atividade.
* Acessar evidência de outro usuário.
* Alterar regras.
* Criar premiações.
* Acessar endpoints administrativos.

### CRITÉRIO DE ACEITE

Nenhuma vulnerabilidade crítica conhecida.

**PARAR E AGUARDAR MINHA APROVAÇÃO.**

---

# FASE 25 — TESTES FINAIS

Criar testes:

### Backend

* Unitários.
* Integração.
* API.

### Banco

* Constraints.
* Foreign Keys.
* Transactions.

### Pontuação

Testar:

* Atividade.
* Bônus.
* Penalidade.
* Ajuste.
* Reversão.

### Segurança

Testar permissões.

### Frontend

Testar:

* Navegação.
* Formulários.
* Ranking.
* Upload.
* Mural.
* Dashboard.

---

# FASE 26 — DOCUMENTAÇÃO FINAL

Criar documentação:

```text
README.md
ARCHITECTURE.md
DATABASE.md
API.md
DEPLOY.md
SECURITY.md
```

Documentar:

* Arquitetura.
* Banco.
* Relacionamentos.
* APIs.
* Autenticação.
* Storage.
* Variáveis de ambiente.
* Instalação.
* Execução.
* Testes.
* Deploy.

---

# 27. MODELO DE ENTREGA DE CADA FASE

Ao concluir qualquer fase, NÃO avance automaticamente.

Sempre responder seguindo este formato:

## FASE X — CONCLUÍDA

### O que foi desenvolvido

Lista objetiva.

### Arquivos criados

Lista.

### Arquivos alterados

Lista.

### Banco de dados

Informar:

* Tabelas criadas.
* Alterações.
* Migrations.

### Backend

Informar:

* Endpoints.
* Services.
* Regras.

### Frontend

Informar:

* Telas.
* Componentes.
* Interações.

### Como testar

Fornecer passos claros.

Exemplo:

```text
1. Execute o projeto.
2. Acesse /login.
3. Entre com usuário de teste.
4. Acesse Modalidades.
5. Crie uma atividade.
6. Envie evidência.
7. Acesse painel administrativo.
8. Aprove.
9. Verifique pontos.
10. Verifique histórico.
```

### Critérios de aceite

Lista objetiva do que deverá funcionar.

### Status

```text
AGUARDANDO APROVAÇÃO
```

**Não iniciar a próxima fase até receber aprovação explícita.**

---

# 28. REGRA PARA CORREÇÕES

Se eu encontrar um erro durante os testes:

Não avance.

Primeiro:

1. Identifique o problema.
2. Explique a causa.
3. Corrija.
4. Teste novamente.
5. Informe o que foi corrigido.
6. Aguarde minha aprovação.

Não considerar uma fase aprovada apenas porque o código foi criado.

A fase somente estará aprovada quando eu confirmar.

---

# 29. REGRA DE DEPENDÊNCIAS

Antes de iniciar cada fase, verificar se as fases anteriores foram aprovadas.

Se uma funcionalidade depender de uma fase ainda não aprovada:

**NÃO IMPLEMENTAR.**

Informar:

> "Esta funcionalidade depende da Fase X, que ainda não foi aprovada."

---

# 30. REGRA DE NÃO REGRESSÃO

Ao implementar uma nova fase:

Não quebrar funcionalidades das fases anteriores.

Após cada implementação:

Executar testes de regressão das funcionalidades já aprovadas.

---

# 31. REGRA ESPECIAL PARA PONTUAÇÃO

Toda alteração de pontos deverá possuir uma origem.

Nunca existir uma alteração genérica como:

```text
+100 pontos
```

sem explicar o motivo.

Toda transação deverá responder:

```text
Quem recebeu?
Quantos pontos?
Quando?
Por quê?
Qual foi a origem?
Qual registro gerou?
Quem aprovou?
```

Exemplo:

```text
Usuário:
Renan

Pontos:
+50

Origem:
Atividade

Modalidade:
Corrida

Atividade:
#ACT-1024

Quantidade:
5 km

Aprovado por:
Administrador

Data:
01/09/2026 18:30
```

Isso deverá ser preservado no banco e apresentado no histórico.

---

# 32. REGRA DE TRANSAÇÃO

Operações críticas deverão ser atômicas.

Exemplo de aprovação:

```text
BEGIN

1. Validar atividade
2. Alterar status
3. Criar transação de pontos
4. Atualizar total
5. Verificar nível
6. Verificar conquistas
7. Atualizar desafio
8. Criar notificações
9. Criar auditoria

COMMIT
```

Se ocorrer erro:

```text
ROLLBACK
```

Não permitir situação em que:

```text
atividade = aprovada
pontos = não registrados
```

ou:

```text
pontos = registrados
atividade = pendente
```

---

# 33. RESULTADO FINAL

Ao final de todas as fases deverá existir uma aplicação completa com:

* Login corporativo.
* Usuários.
* Perfis.
* Avatares.
* Departamentos.
* Modalidades configuráveis.
* Regras configuráveis.
* Motor de pontuação.
* Histórico detalhado de pontos.
* Atividades.
* Evidências.
* Storage.
* Aprovação administrativa.
* Ranking.
* Níveis.
* Conquistas.
* Desafios.
* Premiações.
* Mural.
* Curtidas.
* Comentários.
* Notificações.
* Mensagens motivacionais.
* Dashboard.
* Painel administrativo.
* Auditoria.
* Segurança.
* Banco PostgreSQL.
* API REST.
* Documentação.
* Testes.

---

# 34. ORDEM OBRIGATÓRIA

Seguir exatamente esta sequência:

```text
FASE 0
Planejamento
      ↓
FASE 1
Banco
      ↓
FASE 2
Backend
      ↓
FASE 3
Autenticação
      ↓
FASE 4
Modalidades
      ↓
FASE 5
Pontuação
      ↓
FASE 6
Atividades
      ↓
FASE 7
Evidências
      ↓
FASE 8
Validação
      ↓
FASE 9
Auditoria
      ↓
FASE 10
Ranking
      ↓
FASE 11
Níveis
      ↓
FASE 12
Conquistas
      ↓
FASE 13
Desafios
      ↓
FASE 14
Premiações
      ↓
FASE 15
Mural
      ↓
FASE 16
Notificações
      ↓
FASE 17
Dashboard
      ↓
FASE 18
Perfil
      ↓
FASE 19
Histórico
      ↓
FASE 20
Admin Dashboard
      ↓
FASE 21
Regras
      ↓
FASE 22
UX/Responsividade
      ↓
FASE 23
Segurança
      ↓
FASE 24
Testes
      ↓
FASE 25
Documentação
```

## INSTRUÇÃO FINAL

Comece **somente pela FASE 0**.

Não implemente nenhuma funcionalidade das fases seguintes.

Ao finalizar a FASE 0, apresente:

* O que foi criado.
* Estrutura de arquivos.
* Como executar.
* Como testar.
* Critérios de aceite.

Depois escreva:

**"FASE 0 AGUARDANDO APROVAÇÃO."**

E aguarde minha confirmação.
