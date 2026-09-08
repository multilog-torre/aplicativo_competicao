import { Response } from 'express';

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  };
}

export interface ApiResponseError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: ApiResponseSuccess<T>['meta']
): Response {
  const responseBody: ApiResponseSuccess<T> = {
    success: true,
    data,
    ...(meta && { meta }),
  };
  return res.status(statusCode).json(responseBody);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): Response {
  const responseBody: ApiResponseError = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && details !== null ? { details } : {}),
    },
  };
  return res.status(statusCode).json(responseBody);
}
