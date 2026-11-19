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
        subject: 'Reset your Nexora password',
        text: `You requested a password reset for your Nexora account. Open this link within 30 minutes: ${link.toString()}\n\nIf you did not make this request, please ignore this email.`,
        html: `<p>You requested a password reset for your Nexora account.</p><p><a href="${href}">Reset password</a></p><p>This link expires in 30 minutes. If you did not make this request, please ignore this email.</p>`,
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

  async sendOrderStatus(
    to: string,
    payload: {
      orderId: string;
      status: string;
      paymentStatus: string;
      totalAmount: string;
      createdAt: string;
      reason: string | null;
      items: Array<{
        productName: string;
        sku: string | null;
        quantity: number;
        unitPrice: string;
      }>;
    },
  ): Promise<
    { sent: true } | { sent: false; retryable: boolean; errorCode: string }
  > {
    if (!this.transporter || !this.frontendUrl)
      return {
        sent: false,
        retryable: false,
        errorCode: 'provider_not_configured',
      };
    const statusLabels: Record<string, string> = {
      PENDING: 'Pending confirmation',
      CONFIRMED: 'Confirmed',
      SHIPPING: 'Shipping',
      DELIVERED: 'Delivered',
      DELIVERY_FAILED: 'Delivery unsuccessful',
      CANCELLED: 'Cancelled',
      EXPIRED: 'Expired',
    };
    const status =
      payload.reason === 'EXPIRED'
        ? 'Expired'
        : (statusLabels[payload.status] ?? payload.status);
    const orderUrl = new URL(
      `/orders/${encodeURIComponent(payload.orderId)}`,
      this.frontendUrl,
    ).toString();
    const money = (value: string) =>
      `${new Intl.NumberFormat('vi-VN').format(Number(value))} ₫`;
    const reason =
      payload.reason && payload.reason !== 'EXPIRED'
        ? `\nReason: ${payload.reason}`
        : '';
    const rows = payload.items
      .map(
        (item) =>
          `${item.productName}${item.sku ? ` (${item.sku})` : ''} × ${item.quantity} — ${money(item.unitPrice)}`,
      )
      .join('\n');
    const payment = payload.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid';
    const text = `Nexora order update #${payload.orderId}\nStatus: ${status}\nPayment: ${payment}\nCOD total: ${money(payload.totalAmount)}${reason}\n${payload.status === 'PENDING' ? `\nItems:\n${rows}\n` : ''}\nView order: ${orderUrl}`;
    const html = `<p>Nexora order update <strong>#${this.escapeHtml(payload.orderId)}</strong>.</p><p>Status: ${this.escapeHtml(status)}<br>Payment: ${payment}<br>COD total: ${this.escapeHtml(money(payload.totalAmount))}</p>${reason ? `<p>Reason: ${this.escapeHtml(payload.reason!)}</p>` : ''}${payload.status === 'PENDING' ? `<ul>${payload.items.map((item) => `<li>${this.escapeHtml(item.productName)}${item.sku ? ` (${this.escapeHtml(item.sku)})` : ''} × ${item.quantity} — ${this.escapeHtml(money(item.unitPrice))}</li>`).join('')}</ul>` : ''}<p><a href="${this.escapeHtml(orderUrl)}">View order</a></p>`;
    try {
      await this.transporter.sendMail({
        from: { name: 'Nexora', address: this.gmailUser },
        to,
        subject: `Nexora · Order #${payload.orderId}: ${status}`,
        text,
        html,
      });
      return { sent: true };
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? String(error.code)
          : 'provider_error';
      this.logger.warn(`Gmail SMTP order email failed (${code})`);
      const responseCode =
        error instanceof Error && 'responseCode' in error
          ? Number(error.responseCode)
          : undefined;
      const retryable =
        responseCode === undefined ||
        responseCode < 500 ||
        ['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ESOCKET', 'EDNS'].includes(
          code,
        );
      return {
        sent: false,
        retryable,
        errorCode: /^[A-Z0-9_-]{1,80}$/.test(code) ? code : 'provider_error',
      };
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
