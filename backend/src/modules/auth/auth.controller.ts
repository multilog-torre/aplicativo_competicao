import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { env } from '../../config/env';
import { LoginDTO, RefreshTokenDTO, RegisterDTO } from './auth.dto';
import { AuthService } from './auth.service';

export class AuthController {
  public static async login(req: Request, res: Response): Promise<Response> {
    const data = req.body as LoginDTO;
    const result = await AuthService.login(data);
    return sendSuccess(res, result, 200);
  }

  public static async register(req: Request, res: Response): Promise<Response> {
    const data = req.body as RegisterDTO;
    const result = await AuthService.register(data);
    return sendSuccess(
      res,
      {
        ...result,
        defaultPassword: env.DEFAULT_USER_PASSWORD,
        message: 'Conta criada com sucesso! Aguarde a aprovação de um administrador para poder acessar a plataforma.',
      },
      201,
    );
  }

  public static async getMe(req: Request, res: Response): Promise<Response> {
    const userId = req.user!.id;
    const profile = await AuthService.getMe(userId);
    return sendSuccess(res, profile, 200);
  }

  public static async refreshToken(req: Request, res: Response): Promise<Response> {
    const { refreshToken } = req.body as RefreshTokenDTO;
    const tokens = await AuthService.refreshToken(refreshToken);
    return sendSuccess(res, tokens, 200);
  }

  public static async logout(req: Request, res: Response): Promise<Response> {
    if (req.user) {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'LOGOUT',
          entity: 'User',
          entityId: req.user.id,
          newValues: JSON.stringify({ logoutAt: new Date() }),
        },
      });
    }
    return sendSuccess(res, { message: 'Sessão encerrada com sucesso.' }, 200);
  }

  public static async testParticipant(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, {
      message: `Acesso permitido à área do participante para ${req.user!.name}.`,
      user: req.user,
    });
  }

  public static async testAdmin(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, {
      message: `Acesso permitido ao painel administrativo para ${req.user!.name}.`,
      user: req.user,
    });
  }

  public static async testMaster(req: Request, res: Response): Promise<Response> {
    return sendSuccess(res, {
      message: `Acesso permitido à área Master de Governança para ${req.user!.name}.`,
      user: req.user,
    });
  }
}
