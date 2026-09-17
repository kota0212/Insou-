if (typeof window !== 'undefined') {
  throw new Error('This module can only be used on the server.');
}

import { Resend } from 'resend';
import { maskEmail } from './otp';

export interface SendOtpEmailParams {
  to: string;
  storeName: string;
  otp: string;
}

export interface SendOtpEmailResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export async function sendStoreOtpEmail(
  params: SendOtpEmailParams,
): Promise<SendOtpEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDryRun = process.env.STORE_AUTH_EMAIL_DRY_RUN === 'true';

    // Production 環境での dry-run は絶対禁止
    if (!isProduction && isDryRun) {
      console.info(
        `[RESEND_DRY_RUN] STORE_AUTH_EMAIL_DRY_RUN=true. Simulating OTP email delivery for store "${params.storeName}" to ${maskEmail(params.to)}.`,
      );
      return {
        success: true,
        skipped: true,
        reason: 'dry_run',
      };
    }

    // 通常環境: 未設定時は fail-closed で拒否
    console.error(
      `[RESEND_ERROR] RESEND_API_KEY is not configured. Email delivery failed closed for store "${params.storeName}".`,
    );
    return {
      success: false,
      error: 'メール送信サービスの設定が未完了です。管理本部にお問い合わせください。',
    };
  }

  const fromEmail =
    process.env.RESEND_FROM_EMAIL || 'INSOU Menu <onboarding@resend.dev>';

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [params.to],
      subject: '【INSOU】店舗端末の認証コード',
      text: [
        `INSOU メニュー閲覧システム`,
        ``,
        `${params.storeName} ご担当者様`,
        ``,
        `端末の認証コードを発行しました。`,
        `以下の6桁の認証コードを端末の入力画面に入力してください。`,
        ``,
        `認証コード: ${params.otp}`,
        ``,
        `※ 有効期限: 15分間`,
        `※ このコードは他人に教えないでください。`,
        `※ お心当たりのない場合は、本メールを破棄してください。`,
      ].join('\n'),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
          <div style="border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
            <h1 style="font-size: 20px; font-weight: bold; margin: 0; color: #111827;">INSOU メニュー閲覧システム</h1>
          </div>
          <p style="font-size: 15px; margin-bottom: 16px;"><strong>${escapeHtml(params.storeName)}</strong> ご担当者様</p>
          <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
            端末の認証コードを発行しました。<br />
            以下の6桁の認証コードを端末の認証画面に入力してください。
          </p>
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1f2937;">
              ${params.otp}
            </span>
          </div>
          <p style="font-size: 13px; color: #dc2626; margin-bottom: 8px;">
            ※ 有効期限: <strong>15分間</strong>（有効期限を過ぎると失効します）
          </p>
          <p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin-bottom: 24px;">
            ※ 本コードは店舗端末の認証専用です。第三者への共有は絶対にお控えください。<br />
            ※ お心当たりのない場合は、速やかに管理本部までご連絡ください。
          </p>
          <div style="border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af;">
            INSOU メニュー閲覧システム 管理本部
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('[RESEND_ERROR]', error.message);
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown email error';
    console.error('[RESEND_EXCEPTION]', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
