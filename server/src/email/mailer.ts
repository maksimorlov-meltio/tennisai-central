import nodemailer, { type Transporter } from "nodemailer";
import { env, emailEnabled } from "../env";
import { welcomeEmail, verifyEmailTemplate } from "./templates";

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
