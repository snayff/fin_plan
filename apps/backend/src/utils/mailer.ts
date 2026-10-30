import { config } from "../config/env";

/**
 * Minimal mailer abstraction.
 *
 * Password-reset (and any future transactional) email flows call through here
 * so they can be exercised in tests without a live SMTP server. When SMTP is
 * not configured (the default in dev/test), sends are a logged no-op rather
 * than an error — the flow stays fully functional and the reset link is
 * surfaced in the logs for local development.
 *
 * When SMTP *is* configured we attempt to deliver via a nodemailer transport,
 * loaded lazily so the dependency is only required in environments that
 * actually send mail. If the transport cannot be loaded we log and return
 * rather than throwing, so a mail-delivery outage never leaks into the auth
 * response (which must stay generic and enumeration-safe).
 */

/** The subset of a logger this module needs. Satisfied by Fastify's pino logger and by `console`. */
export interface MailerLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const defaultLogger: MailerLogger = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function isSmtpConfigured(): boolean {
  return Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
}

/** Build the frontend reset link the user follows to complete a password reset. */
export function buildPasswordResetUrl(token: string): string {
  const base = config.APP_URL.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Nodemailer's transport is optional at build time. Type the slice we use so
 * the dynamic import stays free of `any`.
 */
interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

async function loadTransport(): Promise<MailTransport | null> {
  try {
    // Optional dependency — present only in mail-sending environments. A
    // non-literal specifier keeps the type-checker from requiring the module
    // to be installed in envs that never send mail (dev/test/CI).
    const moduleName = "nodemailer";
    const mod = (await import(moduleName)) as {
      createTransport: (opts: unknown) => MailTransport;
    };
    return mod.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    });
  } catch {
    return null;
  }
}

/**
 * Send an email. In unconfigured environments this logs the message and
 * resolves without error. Never throws for delivery problems.
 */
export async function sendEmail(
  message: EmailMessage,
  logger: MailerLogger = defaultLogger
): Promise<void> {
  if (!isSmtpConfigured()) {
    logger.info(
      { to: message.to, subject: message.subject },
      "SMTP not configured — email not sent (dev no-op). See message text in logs."
    );
    logger.info({ text: message.text }, "Email body (dev only)");
    return;
  }

  const transport = await loadTransport();
  if (!transport) {
    logger.warn(
      { to: message.to, subject: message.subject },
      "SMTP configured but transport unavailable — email not sent."
    );
    return;
  }

  try {
    await transport.sendMail({
      from: config.FROM_EMAIL,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html !== undefined ? { html: message.html } : {}),
    });
  } catch (error) {
    logger.error(
      { to: message.to, err: error instanceof Error ? error.message : String(error) },
      "Failed to send email"
    );
  }
}

/**
 * Send a password-reset email. The token is embedded in a frontend link.
 * Safe to call regardless of whether the target account exists — callers that
 * must avoid account enumeration simply skip calling this when there is no
 * matching user.
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  logger: MailerLogger = defaultLogger
): Promise<void> {
  const resetUrl = buildPasswordResetUrl(token);
  const text = [
    "We received a request to reset your finplan password.",
    "",
    "Follow this link to choose a new password (valid for 1 hour):",
    resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email — your password won't change.",
  ].join("\n");

  await sendEmail(
    {
      to: email,
      subject: "Reset your finplan password",
      text,
    },
    logger
  );
}
