// backend/src/mail/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('MAIL_HOST')?.trim();
    const port = Number(this.config.get<string>('MAIL_PORT') ?? '465');
    const user = this.config.get<string>('MAIL_USER')?.trim();
    const pass = this.config.get<string>('MAIL_PASS')?.trim();

    this.from =
      this.config.get<string>('MAIL_FROM')?.trim() ||
      user ||
      'no-reply@pickmovie.local';

    const secureEnv = (
      this.config.get<string>('MAIL_SECURE') ?? ''
    ).toLowerCase();
    const secure =
      secureEnv === 'true'
        ? true
        : secureEnv === 'false'
          ? false
          : port === 465;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      void this.transporter.verify().then(
        () => this.logger.log(`SMTP ready: ${host}:${port} secure=${secure}`),
        (err) => {
          this.logger.error('SMTP verify failed (check MAIL_ env)', err);
          this.transporter = null;
        },
      );
    } else {
      this.logger.warn(
        'MAIL_HOST/MAIL_USER/MAIL_PASS not set. Emails will be logged only.',
      );
    }
  }

  private escapeHtml(v: string) {
    return v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private nl2br(v: string) {
    return this.escapeHtml(v).replace(/\n/g, '<br/>');
  }

  private buildBaseTemplate(opts: {
    title: string;
    subtitle: string;
    buttonText: string;
    url: string;
    footer?: string;
    highlightLabel?: string;
    highlightValue?: string;
  }) {
    const {
      title,
      subtitle,
      buttonText,
      url,
      footer,
      highlightLabel,
      highlightValue,
    } = opts;

    const subject = `[PickMovie] ${title}`;

    const textParts: string[] = [];
    textParts.push(title);
    textParts.push('');
    textParts.push(subtitle);
    textParts.push('');

    if (highlightLabel && highlightValue) {
      textParts.push(`${highlightLabel}: ${highlightValue}`);
      textParts.push('');
    }

    textParts.push(url);
    textParts.push('');
    if (footer) textParts.push(footer);

    const text = textParts.join('\n').trim();

    const safeTitle = this.escapeHtml(title);
    const safeSubtitle = this.nl2br(subtitle);
    const safeBtn = this.escapeHtml(buttonText);
    const safeUrl = this.escapeHtml(url);
    const safeFooter = footer ? this.escapeHtml(footer) : '';

    const safeHighlightLabel = highlightLabel
      ? this.escapeHtml(highlightLabel)
      : '';
    const safeHighlightValue = highlightValue
      ? this.escapeHtml(highlightValue)
      : '';

    // ✅ 이메일 클라이언트 호환성 우선: 라이트 고정 + 테이블 + 인라인 CSS
    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7fb;font-family:Apple SD Gothic Neo,Segoe UI,Roboto,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f7fb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e9e9ef;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px 22px 18px 22px;">
                <div style="font-size:20px;font-weight:800;line-height:1.25;color:#111827;">
                  ${safeTitle}
                </div>
                <div style="margin-top:10px;font-size:14px;line-height:1.6;color:#4b5563;">
                  ${safeSubtitle}
                </div>

                ${
                  highlightLabel && highlightValue
                    ? `
                <div style="margin-top:16px;padding:14px 14px;background:#f7f7ff;border:1px solid #e7e7ff;border-radius:14px;">
                  <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">${safeHighlightLabel}</div>
                  <div style="font-size:18px;font-weight:800;letter-spacing:0.2px;color:#111827;">${safeHighlightValue}</div>
                </div>
                `
                    : ''
                }

                <div style="margin-top:18px;">
                  <a href="${safeUrl}"
                    style="display:inline-block;padding:12px 18px;border-radius:12px;
                           background:#7c3aed;background-image:linear-gradient(90deg,#7c3aed,#db2777);
                           color:#ffffff;text-decoration:none;font-weight:800;">
                    ${safeBtn}
                  </a>
                </div>

                <div style="margin-top:16px;font-size:12px;line-height:1.6;color:#6b7280;">
                  버튼이 안 눌리면 아래 링크를 복사해 브라우저에 붙여넣어주세요.<br/>
                  <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;text-decoration:underline;">${safeUrl}</a>
                </div>

                ${
                  footer
                    ? `<div style="margin-top:16px;font-size:12px;color:#9ca3af;line-height:1.5;">${safeFooter}</div>`
                    : ''
                }
              </td>
            </tr>
          </table>

          <div style="text-align:center;margin-top:12px;font-size:12px;color:#9ca3af;">
            © 2025 PickMovie
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

    return { subject, text, html };
  }

  private async send(to: string, subject: string, html: string, text: string) {
    if (!this.transporter) {
      const firstUrl = text.match(/https?:\/\/\S+/)?.[0];
      this.logger.warn(`[DEV] Email skipped. to=${to} subject=${subject}`);
      if (firstUrl) this.logger.warn(`[DEV] Link: ${firstUrl}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html,
      text,
    });
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    const { subject, html, text } = this.buildBaseTemplate({
      title: '이메일 인증을 완료해주세요',
      subtitle: '아래 버튼을 누르면 이메일 인증이 완료됩니다.',
      buttonText: '이메일 인증하기',
      url: verifyUrl,
      footer: '본 메일은 요청 시에만 발송됩니다.',
    });

    await this.send(to, subject, html, text);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const { subject, html, text } = this.buildBaseTemplate({
      title: '비밀번호 재설정',
      subtitle: '아래 버튼을 눌러 새 비밀번호를 설정하세요.',
      buttonText: '비밀번호 재설정',
      url: resetUrl,
      footer: '본 메일은 요청 시에만 발송됩니다.',
    });

    await this.send(to, subject, html, text);
  }

  /**
   * ✅ 아이디 찾기 메일
   * - 네이버에서도 본문이 보이도록 라이트 템플릿
   * - 아이디는 버튼 위에 강조 노출(마스킹된 값)
   */
  async sendUsernameHint(
    to: string,
    maskedUsername: string,
    loginUrl?: string,
  ): Promise<void> {
    const url =
      loginUrl ||
      `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'}/login`;

    const { subject, html, text } = this.buildBaseTemplate({
      title: '아이디 안내',
      subtitle: '요청하신 계정의 아이디는 보안상 일부 마스킹되어 안내됩니다.',
      buttonText: '로그인 페이지로 이동',
      url,
      footer: '본 메일은 요청 시에만 발송됩니다.',
      highlightLabel: '요청하신 아이디',
      highlightValue: maskedUsername,
    });

    await this.send(to, subject, html, text);
  }
}
