/**
 * Escape a value before it is interpolated into an email's HTML body. Notification
 * titles/messages can carry user-entered text (a player's name, a note title), so
 * they must never be able to inject markup into the message.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface WelcomeOpts {
  firstName: string;
  role: string;
  appUrl: string;
}

/** Welcome email sent to every new account. Returns subject + text + html. */
export function welcomeEmail({ firstName, role, appUrl }: WelcomeOpts) {
  const subject = `Welcome to TennisAI, ${firstName}! 🎾`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `Your TennisAI account is ready — you're signed up as a ${role}.`,
    ``,
    `Sign in any time: ${appUrl}/login`,
    ``,
    `See you on court,`,
    `The TennisAI team`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f0e0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f1a14;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="background:linear-gradient(135deg,#0d7a5f,#0a5f6b);border-radius:20px;padding:28px;color:#fff;">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.85;">TennisAI</div>
        <h1 style="margin:12px 0 0;font-size:24px;">Welcome, ${firstName}! 🎾</h1>
        <p style="margin:10px 0 0;opacity:.9;">Your account is ready — you're set up as a <strong>${role}</strong>.</p>
      </div>
      <div style="padding:24px 4px;">
        <p style="margin:0 0 16px;line-height:1.6;">
          Plan your season, coordinate training and get AI-powered match prep — all in one place.
        </p>
        <a href="${appUrl}/login"
           style="display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">
          Sign in to TennisAI
        </a>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#5b6b62;">
        You received this because an account was created with this email address. If that wasn't you, you can ignore this message.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

interface VerifyOpts {
  firstName: string;
  verifyUrl: string;
}

/** Email verification link sent on signup. Returns subject + text + html. */
export function verifyEmailTemplate({ firstName, verifyUrl }: VerifyOpts) {
  const subject = `Verify your TennisAI email 🎾`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `Please confirm your email address to activate your TennisAI account:`,
    verifyUrl,
    ``,
    `This link expires in 24 hours. If you didn't create an account, you can ignore this email.`,
    ``,
    `The TennisAI team`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f0e0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f1a14;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="background:linear-gradient(135deg,#0d7a5f,#0a5f6b);border-radius:20px;padding:28px;color:#fff;">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.85;">TennisAI</div>
        <h1 style="margin:12px 0 0;font-size:24px;">Confirm your email, ${firstName}</h1>
        <p style="margin:10px 0 0;opacity:.9;">One quick step to activate your account.</p>
      </div>
      <div style="padding:24px 4px;">
        <p style="margin:0 0 16px;line-height:1.6;">
          Click the button below to verify your email address and start using TennisAI.
        </p>
        <a href="${verifyUrl}"
           style="display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">
          Verify my email
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#5b6b62;word-break:break-all;">
          Or paste this link into your browser:<br />${verifyUrl}
        </p>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#5b6b62;">
        This link expires in 24 hours. If you didn't create an account, you can ignore this message.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

interface ResetOpts {
  firstName: string;
  resetUrl: string;
}

/**
 * Password-reset link email. Mirrors the verification email, with the shorter
 * expiry and the "you can ignore this" reassurance a recovery mail needs — the
 * recipient may not be the person who asked for it.
 */
export function resetPasswordTemplate({ firstName, resetUrl }: ResetOpts) {
  const subject = `Reset your TennisAI password 🎾`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `We received a request to reset the password for your TennisAI account.`,
    `Choose a new password here:`,
    resetUrl,
    ``,
    `This link expires in 1 hour and can only be used once.`,
    `If you didn't ask for a password reset, you can ignore this email — your password stays unchanged.`,
    ``,
    `The TennisAI team`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f0e0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f1a14;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="background:linear-gradient(135deg,#0d7a5f,#0a5f6b);border-radius:20px;padding:28px;color:#fff;">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.85;">TennisAI</div>
        <h1 style="margin:12px 0 0;font-size:24px;">Reset your password, ${esc(firstName)}</h1>
        <p style="margin:10px 0 0;opacity:.9;">Set a new password and you're back on court.</p>
      </div>
      <div style="padding:24px 4px;">
        <p style="margin:0 0 16px;line-height:1.6;">
          We received a request to reset the password for your TennisAI account. Click the button below to choose a new one.
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">
          Choose a new password
        </a>
        <p style="margin:16px 0 0;font-size:12px;color:#5b6b62;word-break:break-all;">
          Or paste this link into your browser:<br />${resetUrl}
        </p>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#5b6b62;">
        This link expires in 1 hour and can only be used once. If you didn't ask for a password reset,
        you can ignore this message — your password will stay as it is.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

interface NotificationOpts {
  firstName: string;
  title: string;
  message: string;
  linkUrl?: string;
  appUrl: string;
}

/**
 * Generic transactional notification email — one title, one message, one optional
 * link. Deliberately plain: no marketing copy, no promotion, no tracking.
 */
export function notificationTemplate({ firstName, title, message, linkUrl, appUrl }: NotificationOpts) {
  const subject = `${title} — TennisAI`;
  const link = linkUrl || `${appUrl}/dashboard`;

  const text = [
    `Hi ${firstName},`,
    ``,
    title,
    ``,
    message,
    ``,
    `Open TennisAI: ${link}`,
    ``,
    `The TennisAI team`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f0e0;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#0f1a14;">
    <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
      <div style="background:linear-gradient(135deg,#0d7a5f,#0a5f6b);border-radius:20px;padding:28px;color:#fff;">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.85;">TennisAI</div>
        <h1 style="margin:12px 0 0;font-size:22px;">${esc(title)}</h1>
      </div>
      <div style="padding:24px 4px;">
        <p style="margin:0 0 16px;line-height:1.6;">Hi ${esc(firstName)},</p>
        <p style="margin:0 0 20px;line-height:1.6;">${esc(message).replace(/\n/g, "<br />")}</p>
        <a href="${link}"
           style="display:inline-block;background:#0d7a5f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">
          Open TennisAI
        </a>
      </div>
      <p style="margin:16px 4px 0;font-size:12px;color:#5b6b62;">
        You're receiving this because of activity on your TennisAI account. Manage what you get emailed
        in your notification settings.
      </p>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
