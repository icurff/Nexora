import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class GmailEmailProvider {
  private readonly logger = new Logger(GmailEmailProvider.name);
  private readonly transporter: Transporter | null;
  private readonly gmailUser: string;
  private readonly frontendUrl: URL | null;

  constructor() {
    this.gmailUser = process.env.GMAIL_USER?.trim() ?? '';
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
    this.frontendUrl = this.parseFrontendUrl(process.env.FRONTEND_URL);
    this.transporter =
      this.gmailUser && appPassword
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: { user: this.gmailUser, pass: appPassword },
            connectionTimeout: 3000,
            greetingTimeout: 3000,
            socketTimeout: 3000,
          })
        : null;
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.frontendUrl !== null;
  }

  async sendPasswordReset(to: string, token: string): Promise<boolean> {
    if (!this.transporter || !this.frontendUrl) return false;

    const link = new URL('/reset-password', this.frontendUrl);
    link.searchParams.set('token', token);
    const href = this.escapeHtml(link.toString());

    try {
      await this.transporter.sendMail({
        from: { name: 'Nexora', address: this.gmailUser },
        to,
        subject: 'Đặt lại mật khẩu Nexora',
        text: `Bạn đã yêu cầu đặt lại mật khẩu Nexora. Mở liên kết này trong vòng 30 phút: ${link.toString()}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
        html: `<p>Bạn đã yêu cầu đặt lại mật khẩu Nexora.</p><p><a href="${href}">Đặt lại mật khẩu</a></p><p>Liên kết có hiệu lực trong 30 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
      });
      return true;
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? String(error.code)
          : 'provider_error';
      this.logger.warn(`Gmail SMTP email delivery failed (${code})`);
      return false;
    }
  }

  private parseFrontendUrl(value?: string): URL | null {
    if (!value?.trim()) return null;
    try {
      const url = new URL(value);
      if (
        (url.protocol !== 'https:' && url.protocol !== 'http:') ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      ) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]!,
    );
  }
}
