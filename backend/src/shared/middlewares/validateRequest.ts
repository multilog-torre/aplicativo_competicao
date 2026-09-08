import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

// ZodTypeAny (não AnyZodObject) para aceitar também schemas compostos com
// .refine()/.transform() (ex.: validação cruzada de startDate < endDate em
// challenge.dto.ts), que retornam ZodEffects em vez de um ZodObject puro.
export function validateRequest(schema: {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        req.query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = await schema.params.parseAsync(req.params);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
