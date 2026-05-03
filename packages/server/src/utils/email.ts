import * as nodemailer from "nodemailer";
import { prisma } from "../utils/prisma.js";
import { logInfo, logError } from "./logger.js";
import * as crypto from "crypto";
import fs from "fs";
import path from "path";

export type EmailTemplate =
  | "email_verification"
  | "password_reset"
  | "password_changed"
  | "login_new_device"
  | "account_disabled"
  | "subscription_activated"
  | "subscription_cancelled"
  | "subscription_payment_failed";

export interface EmailOptions {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: Record<string, string>;
  locale?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await prisma.platformSettings.findMany({
    where: { key: { in: ["email.smtp_enabled", "email.smtp_host", "email.smtp_port", "email.smtp_secure", "email.smtp_user", "email.smtp_pass", "email.from_name", "email.from_email"] } },
  });
  const settingMap: Record<string, string> = {};
  for (const s of settings) {
    settingMap[s.key] = s.value;
  }

  const enabledFromDb = settingMap["email.smtp_enabled"] === "true";
  const enabledFromEnv = process.env.SMTP_ENABLED === "true";

  if (!enabledFromDb && !enabledFromEnv) return null;

  const host = settingMap["email.smtp_host"] || process.env.SMTP_HOST || "";
  const port = settingMap["email.smtp_port"] ? parseInt(settingMap["email.smtp_port"], 10) : parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = settingMap["email.smtp_secure"] === "true" || process.env.SMTP_SECURE === "true";
  const user = settingMap["email.smtp_user"] || process.env.SMTP_USER || "";
  const pass = settingMap["email.smtp_pass"] ? decryptSmtpPass(settingMap["email.smtp_pass"]) : process.env.SMTP_PASS || "";
  const fromName = settingMap["email.from_name"] || process.env.SMTP_FROM_NAME || "OpenCord";
  const fromEmail = settingMap["email.from_email"] || process.env.SMTP_FROM_EMAIL || "noreply@opencord.local";

  if (!host) return null;

  return { host: host, port: port, secure: secure, user: user, pass: pass, fromName: fromName, fromEmail: fromEmail };
}

function decryptSmtpPass(encrypted: string): string {
  try {
    const key = Buffer.from(process.env.JWT_SECRET || "default-secret", "utf8");
    const parts = encrypted.split(":");
    const ivHex = parts[0] || "";
    const encryptedHex = parts[1] || "";
    const iv = Buffer.from(ivHex, "hex");
    const encryptedBuffer = Buffer.from(encryptedHex, "hex");
    let key32: Buffer;
    if (key.length >= 32) {
      key32 = key.subarray(0, 32);
    } else {
      key32 = Buffer.concat([key, Buffer.alloc(32 - key.length, 0)]);
    }
    const decipher = crypto.createDecipheriv("aes-256-gcm", key32, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return encrypted;
  }
}

export function encryptSmtpPass(pass: string): string {
  const key = Buffer.from(process.env.JWT_SECRET || "default-secret", "utf8");
  const iv = crypto.randomBytes(16);
  let key32: Buffer;
  if (key.length >= 32) {
    key32 = key.subarray(0, 32);
  } else {
    key32 = Buffer.concat([key, Buffer.alloc(32 - key.length, 0)]);
  }
  const cipher = crypto.createCipheriv("aes-256-gcm", key32, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(pass, "utf8")), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

const TEMPLATE_DIR = path.resolve(process.cwd(), "packages/server/src/templates/emails");

async function renderTemplate(template: EmailTemplate, locale: string, context: Record<string, string>): Promise<string> {
  const safeLocale = locale === "fr" ? "fr" : "en";
  const templatePath = path.join(TEMPLATE_DIR, safeLocale, template + ".html");
  const layoutPath = path.join(TEMPLATE_DIR, "layout.html");

  let templateContent: string;
  let layoutContent: string;

  try {
    templateContent = await fs.promises.readFile(templatePath, "utf8");
  } catch {
    const fallbackPath = path.join(TEMPLATE_DIR, "en", template + ".html");
    templateContent = await fs.promises.readFile(fallbackPath, "utf8");
  }

  try {
    layoutContent = await fs.promises.readFile(layoutPath, "utf8");
  } catch {
    return templateContent;
  }

  let html = layoutContent.replace(/\{\{content\}\}/g, templateContent);
  html = html.replace(/\{\{locale\}\}/g, safeLocale);
  html = html.replace(/\{\{logo_url\}\}/g, (process.env.FRONTEND_URL || "http://localhost:5173") + "/logo.png");

  for (const [key, value] of Object.entries(context)) {
    html = html.replace(new RegExp("\\{\\{" + key + "\\}\\}", "g"), value);
  }

  return html;
}

function getSubject(template: EmailTemplate, locale: string): string {
  const subjects: Record<string, Record<EmailTemplate, string>> = {
    fr: {
      email_verification: "Vérifiez votre adresse email — OpenCord",
      password_reset: "Réinitialisation de mot de passe — OpenCord",
      password_changed: "Votre mot de passe a été modifié — OpenCord",
      login_new_device: "Nouvelle connexion détectée — OpenCord",
      account_disabled: "Votre compte OpenCord a été désactivé",
      subscription_activated: "Bienvenue dans OpenCord+ ! 🎉",
      subscription_cancelled: "Votre abonnement OpenCord+ a été annulé",
      subscription_payment_failed: "Échec de paiement — OpenCord+",
    },
    en: {
      email_verification: "Verify your email address — OpenCord",
      password_reset: "Password reset — OpenCord",
      password_changed: "Your password has been changed — OpenCord",
      login_new_device: "New login detected — OpenCord",
      account_disabled: "Your OpenCord account has been disabled",
      subscription_activated: "Welcome to OpenCord+! 🎉",
      subscription_cancelled: "Your OpenCord+ subscription has been cancelled",
      subscription_payment_failed: "Payment failed — OpenCord+",
    },
  };

  const lang = locale === "fr" ? "fr" : "en";
  return subjects[lang][template] || subjects["en"][template];
}

interface QueuedEmail extends EmailOptions {
  attempts: number;
  resolve: () => void;
  reject: (err: Error) => void;
}

const emailQueue: QueuedEmail[] = [];
let processing = false;

function queueEmail(options: EmailOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    emailQueue.push({ ...options, attempts: 0, resolve: resolve, reject: reject });
    if (!processing) processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (processing || emailQueue.length === 0) return;
  processing = true;

  while (emailQueue.length > 0) {
    const queued = emailQueue.shift()!;
    try {
      await sendEmailImmediate(queued);
      queued.resolve();
    } catch (err) {
      queued.attempts++;
      if (queued.attempts < 3) {
        const delays = [1000, 5000, 30000];
        const delay = delays[queued.attempts - 1] || 30000;
        emailQueue.unshift(queued);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        logError("Email failed after 3 attempts", { to: queued.to, template: queued.template, error: String(err) });
        queued.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  processing = false;
}

async function sendEmailImmediate(options: EmailOptions): Promise<void> {
  const config = await getSmtpConfig();

  if (!config) {
    const locale = options.locale || "en";
    const subject = options.subject || getSubject(options.template, locale);
    const context = options.context;
    let logLink = "";
    if (options.template === "email_verification") logLink = context["verification_url"] || "";
    if (options.template === "password_reset") logLink = context["reset_url"] || "";
    logInfo("[EMAIL] To: " + options.to + " | Subject: " + subject + " | Link: " + logLink);
    return;
  }

  const locale = options.locale || "en";
  const subject = options.subject || getSubject(options.template, locale);
  const html = await renderTemplate(options.template, locale, options.context);
  const from = config.fromName + " <" + config.fromEmail + ">";

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: from,
    to: options.to,
    subject: subject,
    html: html,
  });
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  return queueEmail(options);
}

export async function sendPasswordResetEmail(email: string, token: string, username: string, locale = "en", ipAddress = ""): Promise<void> {
  const resetUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/reset-password?token=" + token;
  await sendEmail({
    to: email,
    template: "password_reset",
    subject: getSubject("password_reset", locale),
    locale: locale,
    context: {
      username: username,
      reset_url: resetUrl,
      expires_in: "1 heure",
      ip_address: ipAddress || "unknown",
    },
  });
}

export async function sendVerificationEmail(email: string, token: string, username: string, locale = "en"): Promise<void> {
  const verifyUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/verify-email?token=" + token;
  await sendEmail({
    to: email,
    template: "email_verification",
    subject: getSubject("email_verification", locale),
    locale: locale,
    context: {
      username: username,
      verification_url: verifyUrl,
      expires_in: "24 heures",
    },
  });
}

export async function sendPasswordChangedEmail(email: string, username: string, locale = "en", ipAddress = ""): Promise<void> {
  const date = new Date().toLocaleString(locale === "fr" ? "fr-FR" : "en-US");
  await sendEmail({
    to: email,
    template: "password_changed",
    subject: getSubject("password_changed", locale),
    locale: locale,
    context: {
      username: username,
      date: date,
      ip_address: ipAddress || "unknown",
    },
  });
}

export async function sendLoginNewDeviceEmail(email: string, username: string, locale = "en", deviceInfo = "", ipAddress = ""): Promise<void> {
  const date = new Date().toLocaleString(locale === "fr" ? "fr-FR" : "en-US");
  const sessionsUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/settings/sessions";
  await sendEmail({
    to: email,
    template: "login_new_device",
    subject: getSubject("login_new_device", locale),
    locale: locale,
    context: {
      username: username,
      device_info: deviceInfo || "Unknown device",
      ip_address: ipAddress || "unknown",
      date: date,
      sessions_url: sessionsUrl,
    },
  });
}

export async function sendAccountDisabledEmail(email: string, username: string, locale = "en", reason = ""): Promise<void> {
  await sendEmail({
    to: email,
    template: "account_disabled",
    subject: getSubject("account_disabled", locale),
    locale: locale,
    context: {
      username: username,
      reason: reason || "No reason provided",
    },
  });
}

export async function sendSubscriptionActivatedEmail(email: string, username: string, planName = "OpenCord+", locale = "en", price = "5,00 €/mois"): Promise<void> {
  const featuresUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/premium";
  await sendEmail({
    to: email,
    template: "subscription_activated",
    subject: getSubject("subscription_activated", locale),
    locale: locale,
    context: {
      username: username,
      plan_name: planName,
      price: price,
      features_url: featuresUrl,
    },
  });
}

export async function sendSubscriptionCancelledEmail(email: string, username: string, locale = "en", endDate = ""): Promise<void> {
  await sendEmail({
    to: email,
    template: "subscription_cancelled",
    subject: getSubject("subscription_cancelled", locale),
    locale: locale,
    context: {
      username: username,
      end_date: endDate || "unknown date",
    },
  });
}

export async function sendSubscriptionPaymentFailedEmail(email: string, username: string, locale = "en", retryDate = "", manageUrl = ""): Promise<void> {
  await sendEmail({
    to: email,
    template: "subscription_payment_failed",
    subject: getSubject("subscription_payment_failed", locale),
    locale: locale,
    context: {
      username: username,
      retry_date: retryDate || "soon",
      manage_url: manageUrl || (process.env.FRONTEND_URL || "http://localhost:5173") + "/premium",
    },
  });
}

export async function testSmtpConfig(testEmail: string): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  try {
    const config = await getSmtpConfig();
    if (!config) return { sent: false, error: "SMTP not configured or not enabled" };

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });

    await transporter.verify();

    const info = await transporter.sendMail({
      from: config.fromName + " <" + config.fromEmail + ">",
      to: testEmail,
      subject: "OpenCord Email Test",
      html: "<p>This is a test email from OpenCord. If you received this, your SMTP configuration is working correctly.</p>",
    });

    return { sent: true, messageId: info.messageId };
  } catch (err) {
    return { sent: false, error: String(err) };
  }
}
