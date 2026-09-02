import nodemailer, { type Transporter } from "nodemailer";
import { env, emailEnabled, mailTransport } from "../env";
import { welcomeEmail, verifyEmailTemplate, resetPasswordTemplate, notificationTemplate } from "./templates";

let transporter: Transporter | null = null;

/**
 * Lazily build the mail transport, only when credentials are configured:
 * Gmail when its app password is set, otherwise any SMTP provider.
 *
 * SMTP is here because Gmail will not issue an app password until 2-Step
 * Verification is switched on for the whole Google account — a change some
 * operators cannot make. Resend, Brevo and Mailgun hand over SMTP credentials
 * on the spot.
 */
function getTransport(): Transporter | null {
  if (!emailEnabled) return null;
  if (!transporter) {
    transporter =
      mailTransport === "gmail"
        ? nodemailer.createTransport({
            service: "gmail",
            auth: { user: env.gmailUser, pass: env.gmailAppPassword },
          })
        : nodemailer.createTransport({
            host: env.smtpHost,
            port: env.smtpPort,
            secure: env.smtpSecure,
            // Some relays authorise by IP and expect no auth block at all —
            // handing those an empty user/pass is an authentication failure,
            // not a no-op.
            ...(env.smtpUser ? { auth: { user: env.smtpUser, pass: env.smtpPassword } } : {}),
          });
  }
  return transporter;
}

/**
 * The From header. Gmail must send as the authenticated account — it rewrites
 * anything else — while an SMTP provider sends as the address the domain has
 * authorised, which cannot be guessed and so comes from MAIL_FROM.
 */
function fromHeader(): string {
  const address = mailTransport === "gmail" ? env.gmailUser : env.mailFrom || env.smtpUser;
  return `"${env.mailFromName}" <${address}>`;
}

/**
 * Prove the configured credentials work, without sending anything. Called once
 * at boot so a wrong password appears in the log straight away instead of as a
 * user who never receives their verification link.
 */
export async function verifyMailTransport(): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) return { ok: false, error: "no transport configured" };
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send the welcome email for a new account.
 *
 * - If a mail transport is configured (Gmail or SMTP), sends a real email.
 * - Otherwise logs the email to the console (dev fallback) so signup still
 *   works without any credentials.
 *
 * Never throws: email is a side effect and must not break account creation.
 */
export async function sendWelcomeEmail(to: string, firstName: string, role: string): Promise<{ sent: boolean }> {
  const { subject, text, html } = welcomeEmail({ firstName, role, appUrl: env.appUrl });
  const transport = getTransport();

  if (!transport) {
    console.log(
      `\n📧 [welcome email — no mail transport, logging only]` +
        `\n   To:      ${to}` +
        `\n   Subject: ${subject}` +
        `\n   → Set GMAIL_USER + GMAIL_APP_PASSWORD, or SMTP_HOST + MAIL_FROM, to send for real.\n`
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({
      from: fromHeader(),
      to,
      subject,
      text,
      html,
    });
    console.log(`📧 Welcome email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`📧 Welcome email FAILED for ${to}:`, err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

/**
 * Send the email-verification link. Same behaviour as the welcome email: real
 * send when a transport is configured, otherwise log the link so the
 * flow is testable in dev without credentials.
 */
export async function sendVerificationEmail(to: string, firstName: string, verifyUrl: string): Promise<{ sent: boolean }> {
  const { subject, text, html } = verifyEmailTemplate({ firstName, verifyUrl });
  const transport = getTransport();

  if (!transport) {
    console.log(
      `\n📧 [verification email — no mail transport, logging only]` +
        `\n   To:     ${to}` +
        `\n   Verify: ${verifyUrl}\n`,
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: fromHeader(), to, subject, text, html });
    console.log(`📧 Verification email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`📧 Verification email FAILED for ${to}:`, err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

/**
 * Send the password-reset link. Same fire-and-forget contract as the other
 * mails: never throws, so the /forgot-password response is unaffected by the
 * mail provider.
 *
 * The reset URL contains a live credential, so it is only echoed to the console
 * outside production (the dev path where Gmail is not configured). In production
 * a missing transport is logged as a misconfiguration WITHOUT the link.
 */
export async function sendPasswordResetEmail(to: string, firstName: string, resetUrl: string): Promise<{ sent: boolean }> {
  const { subject, text, html } = resetPasswordTemplate({ firstName, resetUrl });
  const transport = getTransport();

  if (!transport) {
    if (env.isProd) {
      console.error(
        `📧 [password-reset email NOT SENT — no mail transport is configured]` +
          `\n   To: ${to} — set GMAIL_USER + GMAIL_APP_PASSWORD or SMTP_HOST. Link withheld from logs.`,
      );
    } else {
      console.log(
        `\n📧 [password-reset email — no mail transport, logging only]` +
          `\n   To:    ${to}` +
          `\n   Reset: ${resetUrl}\n`,
      );
    }
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: fromHeader(), to, subject, text, html });
    console.log(`📧 Password-reset email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`📧 Password-reset email FAILED for ${to}:`, err instanceof Error ? err.message : err);
    return { sent: false };
  }
}

/**
 * Send a generic transactional notification email (e.g. "your coach shared a
 * game plan"). Plain and factual — this is not a marketing channel.
 *
 * Same contract as every other mail here: fire-and-forget, never throws, logs
 * instead of sending when no mail transport is configured.
 */
export async function sendNotificationEmail(opts: {
  to: string;
  firstName: string;
  title: string;
  message: string;
  linkUrl?: string;
}): Promise<{ sent: boolean }> {
  const { to, firstName, title, message, linkUrl } = opts;
  const { subject, text, html } = notificationTemplate({
    firstName,
    title,
    message,
    linkUrl,
    appUrl: env.appUrl,
  });
  const transport = getTransport();

  if (!transport) {
    console.log(
      `\n📧 [notification email — no mail transport, logging only]` +
        `\n   To:      ${to}` +
        `\n   Subject: ${subject}` +
        `\n   Body:    ${message}` +
        (linkUrl ? `\n   Link:    ${linkUrl}` : "") +
        `\n`,
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: fromHeader(), to, subject, text, html });
    console.log(`📧 Notification email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`📧 Notification email FAILED for ${to}:`, err instanceof Error ? err.message : err);
    return { sent: false };
  }
}
