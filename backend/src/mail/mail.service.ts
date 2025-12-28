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

  private buildButtonTemplate(opts: {
    title: string;
    subtitle: string;
    buttonText: string;
    url: string;
    footer?: string;
  }) {
    const { title, subtitle, buttonText, url, footer } = opts;

    const subject = `[PickMovie] ${title}`;
    const text = `${title}\n\n${subtitle}\n\n${url}\n\n${footer ?? ''}`.trim();

    const html = `
<!doctype html>
<html>
  <body style="margin:0;background:#0b0b10;font-family:Apple SD Gothic Neo,Segoe UI,Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 18px;">
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:26px;color:#fff;">
        <div style="font-size:20px;font-weight:800;margin-bottom:10px;">${title}</div>
        <div style="color:rgba(255,255,255,0.75);line-height:1.6;margin-bottom:18px;">${subtitle}</div>
        <a href="${url}"
           style="display:inline-block;padding:12px 18px;border-radius:12px;
                  background:linear-gradient(90deg,#7c3aed,#db2777);
                  color:#fff;text-decoration:none;font-weight:700;">
          ${buttonText}
        </a>
        <div style="margin-top:16px;color:rgba(255,255,255,0.55);font-size:12px;line-height:1.5;">
          버튼이 안 눌리면 아래 링크를 복사해 브라우저에 붙여넣어주세요.<br/>
          <span style="word-break:break-all;">${url}</span>
        </div>
        ${
          footer
            ? `<div style="margin-top:18px;color:rgba(255,255,255,0.45);font-size:12px;">${footer}</div>`
            : ''
        }
      </div>
      <div style="text-align:center;margin-top:14px;color:rgba(255,255,255,0.35);font-size:12px;">
        © 2025 PickMovie
      </div>
    </div>
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
    const { subject, html, text } = this.buildButtonTemplate({
      title: '이메일 인증을 완료해주세요',
      subtitle: '아래 버튼을 누르면 이메일 인증이 완료됩니다.',
      buttonText: '이메일 인증하기',
      url: verifyUrl,
      footer: '본 메일은 요청 시에만 발송됩니다.',
    });

    await this.send(to, subject, html, text);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const { subject, html, text } = this.buildButtonTemplate({
      title: '비밀번호 재설정',
      subtitle: '아래 버튼을 눌러 새 비밀번호를 설정하세요.',
      buttonText: '비밀번호 재설정',
      url: resetUrl,
      footer: '본 메일은 요청 시에만 발송됩니다.',
    });

    await this.send(to, subject, html, text);
  }

  /**
   * ✅ 아이디 찾기 메일 UX 개선 + 보안(마스킹)
   * - username을 그대로 보내지 않고, 마스킹된 아이디를 안내
   * - 버튼은 로그인 페이지로 이동
   */
  async sendUsernameHint(
    to: string,
    maskedUsername: string,
    loginUrl?: string,
  ): Promise<void> {
    const url =
      loginUrl ||
      `${this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173'}/login`;

    const { subject, html, text } = this.buildButtonTemplate({
      title: '아이디 안내',
      subtitle: `요청하신 계정의 아이디는 보안상 일부 마스킹되어 안내됩니다.\n\n아이디: ${maskedUsername}`,
      buttonText: '로그인 페이지로 이동',
      url,
      footer: '본 메일은 요청 시에만 발송됩니다.',
    });

    await this.send(to, subject, html, text);
  }
}
