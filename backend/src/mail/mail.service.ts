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
    brandTitle?: boolean;
  }) {
    const {
      title,
      subtitle,
      buttonText,
      url,
      footer,
      highlightLabel,
      highlightValue,
      brandTitle,
    } = opts;

    const subject = title;

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

    const extraText =
      highlightLabel && highlightValue
        ? `${highlightLabel}: ${highlightValue}`
        : '';

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:Apple SD Gothic Neo,Segoe UI,Roboto,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:34px 16px;">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;">
            <tr>
              <td style="padding:12px 14px 0 14px;text-align:left;">
                <div style="font-size:34px;font-weight:800;line-height:1.12;color:#111827;letter-spacing:-0.02em;">
                  ${
                    brandTitle
                      ? '<span style="background-image:linear-gradient(90deg,#7c3aed,#ec4899);-webkit-background-clip:text;background-clip:text;color:transparent;">Pick</span><span style="color:#111827;">Movie</span>'
                      : safeTitle
                  }
                </div>
                <div style="margin-top:12px;font-size:18px;line-height:1.55;color:#6b7280;">
                  ${safeSubtitle}
                </div>

                ${
                  extraText
                    ? `
                <div style="margin-top:10px;font-size:16px;line-height:1.5;color:#6b7280;">${safeHighlightLabel}: <span style="font-weight:700;color:#374151;">${safeHighlightValue}</span></div>
                `
                    : ''
                }

                <div style="margin-top:22px;">
                  <a href="${safeUrl}"
                    style="display:inline-block;padding:13px 20px;border-radius:10px;
                           background:#7c3aed;background-image:linear-gradient(90deg,#7c3aed,#db2777);
                           color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:1.4;">
                    ${safeBtn}
                  </a>
                </div>

                <div style="margin-top:20px;font-size:16px;line-height:1.5;color:#6b7280;">
                  버튼이 안 눌리면 아래 링크를 복사해 브라우저에 붙여넣어주세요.<br/>
                </div>

                <div style="margin-top:8px;font-size:15px;line-height:1.55;">
                  <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;text-decoration:underline;">${safeUrl}</a>
                </div>
                ${
                  footer
                    ? `<div style="margin-top:16px;font-size:14px;color:#9ca3af;line-height:1.5;">${safeFooter}</div>`
                    : ''
                }
              </td>
            </tr>
          </table>

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
      title: 'PickMovie 이메일 인증',
      subtitle: '아래 버튼을 누르면 이메일 인증이 완료됩니다.',
      buttonText: '계속하기',
      url: verifyUrl,
      footer: '이 링크는 24시간 동안 유효합니다.',
      brandTitle: true,
    });

    await this.send(to, subject, html, text);
  }

  async sendEmailAuthLink(
    to: string,
    authUrl: string,
    mode: 'login' | 'signup',
  ): Promise<void> {
    const title = mode === 'signup' ? 'PickMovie 회원가입' : 'PickMovie 로그인';
    const { subject, html, text } = this.buildBaseTemplate({
      title,
      subtitle:
        '아래 버튼을 누르면 로그인 또는 회원가입이 자동으로 진행됩니다.',
      buttonText: '계속하기',
      url: authUrl,
      footer: '본 메일은 요청 시에만 발송되며, 링크는 20분 후 만료됩니다.',
      brandTitle: true,
    });

    await this.send(to, subject, html, text);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const { subject, html, text } = this.buildBaseTemplate({
      title: 'PickMovie 비밀번호 재설정',
      subtitle: '아래 버튼을 눌러 새 비밀번호를 설정하세요.',
      buttonText: '계속하기',
      url: resetUrl,
      footer: '이 링크는 15분 동안 유효합니다.',
      brandTitle: true,
    });

    await this.send(to, subject, html, text);
  }

  async sendEmailChangeVerify(to: string, verifyUrl: string): Promise<void> {
    const { subject, html, text } = this.buildBaseTemplate({
      title: 'PickMovie 이메일 변경',
      subtitle: '아래 버튼을 누르면 이메일 변경이 완료됩니다.',
      buttonText: '계속하기',
      url: verifyUrl,
      footer: '이 링크는 30분 동안 유효합니다.',
      brandTitle: true,
    });

    await this.send(to, subject, html, text);
  }

  /**
   * 아이디 찾기 메일
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
      title: 'PickMovie 아이디 안내',
      subtitle: '요청하신 계정의 아이디는 보안상 일부 마스킹되어 안내됩니다.',
      buttonText: '계속하기',
      url,
      footer: '본 메일은 요청 시에만 발송됩니다.',
      highlightLabel: '요청하신 아이디',
      highlightValue: maskedUsername,
      brandTitle: true,
    });

    await this.send(to, subject, html, text);
  }
}
