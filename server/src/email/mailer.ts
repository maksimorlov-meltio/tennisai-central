import nodemailer, { type Transporter } from "nodemailer";
import { env, emailEnabled } from "../env";
import { welcomeEmail, verifyEmailTemplate, resetPasswordTemplate, notificationTemplate } from "./templates";

let transporter: Transporter | null = null;

/** Lazily build a Gmail transport, only when credentials are configured. */
function getTransport(): Transporter | null {
  if (!emailEnabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: env.gmailUser, pass: env.gmailAppPassword },
    });
  }
  return transporter;
}

/**
 * Send the welcome email for a new account.
 *
 * - If Gmail credentials are configured, sends a real email via Gmail.
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
      `\n📧 [welcome email — Gmail disabled, logging only]` +
        `\n   To:      ${to}` +
        `\n   Subject: ${subject}` +
        `\n   → Set GMAIL_USER + GMAIL_APP_PASSWORD in server/.env to send for real.\n`
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({
      from: `"${env.mailFromName}" <${env.gmailUser}>`,
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
 * send when Gmail is configured, otherwise log the link to the console so the
 * flow is testable in dev without credentials.
 */
export async function sendVerificationEmail(to: string, firstName: string, verifyUrl: string): Promise<{ sent: boolean }> {
  const { subject, text, html } = verifyEmailTemplate({ firstName, verifyUrl });
  const transport = getTransport();

  if (!transport) {
    console.log(
      `\n📧 [verification email — Gmail disabled, logging only]` +
        `\n   To:     ${to}` +
        `\n   Verify: ${verifyUrl}\n`,
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: `"${env.mailFromName}" <${env.gmailUser}>`, to, subject, text, html });
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
        `📧 [password-reset email NOT SENT — Gmail is not configured]` +
          `\n   To: ${to} — set GMAIL_USER + GMAIL_APP_PASSWORD. Link withheld from logs.`,
      );
    } else {
      console.log(
        `\n📧 [password-reset email — Gmail disabled, logging only]` +
          `\n   To:    ${to}` +
          `\n   Reset: ${resetUrl}\n`,
      );
    }
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: `"${env.mailFromName}" <${env.gmailUser}>`, to, subject, text, html });
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
 * instead of sending when Gmail credentials are absent.
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
      `\n📧 [notification email — Gmail disabled, logging only]` +
        `\n   To:      ${to}` +
        `\n   Subject: ${subject}` +
        `\n   Body:    ${message}` +
        (linkUrl ? `\n   Link:    ${linkUrl}` : "") +
        `\n`,
    );
    return { sent: false };
  }

  try {
    await transport.sendMail({ from: `"${env.mailFromName}" <${env.gmailUser}>`, to, subject, text, html });
    console.log(`📧 Notification email sent to ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`📧 Notification email FAILED for ${to}:`, err instanceof Error ? err.message : err);
    return { sent: false };
  }
}
