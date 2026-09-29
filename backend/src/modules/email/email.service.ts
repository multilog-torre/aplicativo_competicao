import { Resend } from 'resend';
import { env } from '../../config/env';

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

export class EmailService {
  /**
   * Envia o e-mail de "esqueci minha senha" com o link de redefinição.
   * Sem RESEND_API_KEY configurada (dev local), o link só é logado no
   * console em vez de enviado de verdade — evita que "esqueci minha senha"
   * quebre em ambiente sem e-mail configurado, mas nunca deve acontecer em
   * produção (ver EMAIL_FROM/RESEND_API_KEY em .env.example).
   */
  public static async sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
    const resend = getClient();

    if (!resend) {
      console.log(`[EmailService] RESEND_API_KEY não configurada — link de redefinição pra ${to}: ${resetUrl}`);
      return;
    }

    await resend.emails.send({
      from: env.EMAIL_FROM,
      to,
      subject: 'Redefinição de senha — Torre',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #001e42;">Redefinição de senha</h2>
          <p>Olá, ${name}!</p>
          <p>Recebemos um pedido pra redefinir a senha da sua conta no Torre. Se foi você, clique no botão abaixo pra escolher uma senha nova:</p>
          <p style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background: #001e42; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Redefinir minha senha
            </a>
          </p>
          <p style="color: #6b7280; font-size: 0.85rem;">Este link expira em 1 hora. Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha continua a mesma.</p>
        </div>
      `,
    });
  }
}
