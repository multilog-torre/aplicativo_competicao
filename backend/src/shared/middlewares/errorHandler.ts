import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { sendError } from '../utils/apiResponse';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response {
  // 1. Erros customizados da aplicação
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  // 2. Erros de validação do Zod
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(
      res,
      422,
      'VALIDATION_ERROR',
      'Os dados enviados são inválidos ou estão incompletos',
      formattedErrors
    );
  }

  // 3. Erros de upload de arquivo (Multer — tamanho, campo inesperado, etc.)
  if (err instanceof MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: 'O arquivo enviado excede o tamanho máximo permitido.',
      LIMIT_UNEXPECTED_FILE: 'Campo de arquivo inesperado ou múltiplos arquivos não permitidos.',
    };
    return sendError(
      res,
      422,
      'UPLOAD_ERROR',
      messages[err.code] ?? `Erro no upload do arquivo: ${err.message}`,
    );
  }

  // 4. Erro interno não tratado (500)
  console.error('💥 Erro não tratado no servidor:', err);

  const message =
    process.env.NODE_ENV === 'production'
      ? 'Ocorreu um erro interno no servidor.'
      : err.message || 'Erro interno no servidor.';

  return sendError(res, 500, 'INTERNAL_SERVER_ERROR', message);
}
