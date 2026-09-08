import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
}

/** Resolve o usuário a partir do header Authorization. Lança em qualquer falha. */
async function resolveUserFromRequest(req: Request): Promise<NonNullable<Request['user']>> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new UnauthorizedError('Token de autenticação não fornecido no cabeçalho Authorization');
  }

  const [, token] = authHeader.split(' ');

  if (!token) {
    throw new UnauthorizedError('Formato do token inválido. Utilize o formato: Bearer <token>');
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Token de autenticação inválido ou expirado');
  }

  // Busca dados atualizados do usuário com suas roles e permissões
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user || user.status !== 'ACTIVE') {
    throw new UnauthorizedError('Usuário inexistente, inativo ou com acesso bloqueado');
  }

  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = Array.from(
    new Set(
      user.userRoles.flatMap((ur) =>
        ur.role.rolePermissions.map((rp) => rp.permission.name)
      )
    )
  );

  return {
    id: user.id,
    corporateId: user.corporateId,
    email: user.email,
    name: user.name,
    departmentId: user.departmentId,
    roles,
    permissions,
  };
}

export async function ensureAuthenticated(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await resolveUserFromRequest(req);
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Preenche req.user quando um token válido é enviado, mas NUNCA bloqueia a
 * requisição — usado em rotas públicas que precisam de um comportamento
 * ligeiramente diferente para administradores (ex.: GET /game-rules mostra
 * passos INACTIVE só para quem está autenticado como admin).
 */
export async function attachUserIfPresent(req: Request, _res: Response, next: NextFunction) {
  if (!req.headers.authorization) return next();
  try {
    req.user = await resolveUserFromRequest(req);
  } catch {
    // Token ausente/inválido em rota pública: segue anônimo, sem erro.
  }
  return next();
}

export function requireRoles(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
      }

      // Se for ADMIN_MASTER, tem acesso irrestrito
      if (req.user.roles.includes('ADMIN_MASTER')) {
        return next();
      }

      const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

      if (!hasRole) {
        throw new ForbiddenError(
          `Acesso negado. Esta operação requer um dos seguintes perfis: ${allowedRoles.join(', ')}`
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requirePermission(permissionName: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Usuário não autenticado');
      }

      // ADMIN_MASTER tem todas as permissões
      if (req.user.roles.includes('ADMIN_MASTER')) {
        return next();
      }

      const hasPermission = req.user.permissions.includes(permissionName);

      if (!hasPermission) {
        throw new ForbiddenError(
          `Acesso negado. O usuário não possui a permissão requerida: '${permissionName}'`
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
