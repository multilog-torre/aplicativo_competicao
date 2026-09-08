import { NextFunction, Request, Response } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    let statusColor = '\x1b[32m'; // verde para 2xx
    if (statusCode >= 400 && statusCode < 500) statusColor = '\x1b[33m'; // amarelo para 4xx
    if (statusCode >= 500) statusColor = '\x1b[31m'; // vermelho para 5xx

    const resetColor = '\x1b[0m';
    const methodColor = '\x1b[36m'; // ciano

    console.log(
      `[HTTP] ${methodColor}${method.padEnd(6)}${resetColor} ${originalUrl} -> ${statusColor}${statusCode}${resetColor} (${duration}ms)`
    );
  });

  next();
}
