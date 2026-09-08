export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Sistema Corporativo de Competição e Gamificação — API REST',
    version: '1.0.0',
    description: `
API REST oficial da plataforma corporativa de gamificação.
Fornece suporte a:
- Autenticação e Autorização RBAC (Participante, Admin, Admin Master)
- Gestão de Modalidades dinâmicas e regras de cálculo de pontos
- Submissão, upload de evidências e validação atômica de atividades
- Ledger imutável de transações de pontuação (\`points_transactions\`)
- Rankings dinâmicos com filtros por período e setor
- Progressão de Níveis, Conquistas, Desafios e Catálogo de Premiações
- Mural social corporativo e Trilha de Auditoria detalhada (\`audit_logs\`)
    `,
  },
  servers: [
    {
      url: 'http://localhost:3001/api/v1',
      description: 'Servidor Local de Desenvolvimento',
    },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Verificação de Saúde da API e Conectividade do Banco de Dados',
        responses: {
          '200': { description: 'API e Banco operando normalmente' },
        },
      },
    },
    '/info': {
      get: {
        tags: ['Sistema'],
        summary: 'Informações gerais da plataforma',
        responses: {
          '200': { description: 'Informações retornadas com sucesso' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Autenticação corporativa do usuário',
        responses: {
          '200': { description: 'Login realizado com sucesso' },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Autenticação'],
        summary: 'Consulta o perfil completo do usuário autenticado',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Perfil retornado com sucesso' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Autenticação'],
        summary: 'Renovação do token de acesso',
        responses: {
          '200': { description: 'Token renovado' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Autenticação'],
        summary: 'Encerramento de sessão',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Sessão encerrada' },
        },
      },
    },
    '/activity-types': {
      get: {
        tags: ['Modalidades'],
        summary: 'Lista modalidades de atividades disponíveis',
        parameters: [
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Lista de modalidades retornada com sucesso' },
        },
      },
      post: {
        tags: ['Modalidades'],
        summary: 'Cria uma nova modalidade de atividade (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'scoringType', 'basePoints'],
                properties: {
                  name: { type: 'string', example: 'Natação' },
                  description: { type: 'string', example: 'Natação estilo livre ou treino' },
                  category: { type: 'string', example: 'SPORTS' },
                  icon: { type: 'string', example: 'waves' },
                  rulesDescription: { type: 'string', example: '10 pontos a cada 500 metros' },
                  scoringType: { type: 'string', example: 'QUANTITY' },
                  basePoints: { type: 'integer', example: 10 },
                  unit: { type: 'string', example: 'metros' },
                  multiplier: { type: 'number', example: 0.02 },
                  requiresEvidence: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Modalidade criada com sucesso' },
          '403': { description: 'Acesso negado - Requer perfil ADMIN' },
          '409': { description: 'Nome de modalidade já existente' },
        },
      },
    },
    '/activity-types/{id}': {
      get: {
        tags: ['Modalidades'],
        summary: 'Busca detalhes de uma modalidade por ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Detalhes da modalidade retornados' },
          '404': { description: 'Modalidade não encontrada' },
        },
      },
      patch: {
        tags: ['Modalidades'],
        summary: 'Atualiza configurações e regras de uma modalidade (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Modalidade atualizada com sucesso' },
          '403': { description: 'Acesso negado' },
          '404': { description: 'Modalidade não encontrada' },
        },
      },
      delete: {
        tags: ['Modalidades'],
        summary: 'Exclui ou desativa uma modalidade (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Modalidade removida ou inativada com sucesso' },
          '403': { description: 'Acesso negado' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};
