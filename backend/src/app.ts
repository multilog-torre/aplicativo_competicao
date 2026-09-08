import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerDocument } from './docs/swagger';
import { apiRouter } from './routes';
import { NotFoundError } from './shared/errors/AppError';
import { errorHandler } from './shared/middlewares/errorHandler';
import { requestLogger } from './shared/middlewares/requestLogger';

const app: Express = express();

// 1. Middlewares Globais de Segurança e Parsing
app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 2. Middleware de Logs HTTP
if (env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// 3. Documentação Swagger/OpenAPI
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 4. Rota raiz
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/api/docs');
});

// 5. Rotas da API v1
app.use('/api/v1', apiRouter);

// 6. Tratamento de Rotas Inexistentes (404)
app.use((req: Request, _res: Response, next) => {
  next(new NotFoundError(`A rota '${req.method} ${req.originalUrl}' não foi encontrada na API.`));
});

// 7. Middleware Central de Tratamento de Erros
app.use(errorHandler);

export { app };
