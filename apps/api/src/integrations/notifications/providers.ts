import nodemailer from 'nodemailer';
import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';

export interface OutboundMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface DeliveryResult {
  providerMessageId?: string;
}

export interface ChannelProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<DeliveryResult>;
}

const mask = (v: string) => (v.length <= 4 ? '****' : `${'*'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`);

/** Development fallback: logs a masked destination and the (non-clinical) message. */
class ConsoleProvider implements ChannelProvider {
  constructor(readonly name: string) {}
  async send(m: OutboundMessage): Promise<DeliveryResult> {
    if (isProduction) throw new Error(`${this.name} provider is not configured`);
    logger.info({ channel: this.name, to: mask(m.to), title: m.title, body: m.body }, 'DEV notification (not delivered)');
    return { providerMessageId: `console-${Date.now()}` };
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Provider HTTP ${res.status}`);
  return json;
}

/** Expo push service (works for both Android FCM and iOS APNs via Expo tokens). */
class ExpoPushProvider implements ChannelProvider {
  readonly name = 'expo-push';
  constructor(private accessToken?: string) {}
  async send(m: OutboundMessage): Promise<DeliveryResult> {
    const json = await postJson(
      'https://exp.host/--/api/v2/push/send',
      { to: m.to, title: m.title, body: m.body, data: m.data ?? {}, sound: 'default', priority: 'high' },
      this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {},
    );
    const data = json.data as { status?: string; id?: string; message?: string } | undefined;
    if (data?.status === 'error') throw new Error(`Expo push error: ${data.message ?? 'unknown'}`);
    return { providerMessageId: data?.id };
  }
}

/** Termii (Nigerian SMS gateway). */
class TermiiSmsProvider implements ChannelProvider {
  readonly name = 'termii';
  async send(m: OutboundMessage): Promise<DeliveryResult> {
    const json = await postJson('https://api.ng.termii.com/api/sms/send', {
      api_key: env.SMS_API_KEY,
      to: m.to.replace(/^\+/, ''),
      from: env.SMS_SENDER_ID,
      sms: m.body,
      type: 'plain',
      channel: 'generic',
    }, {});
    return { providerMessageId: String(json.message_id ?? '') };
  }
}

class SmtpEmailProvider implements ChannelProvider {
  readonly name = 'smtp';
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  async send(m: OutboundMessage): Promise<DeliveryResult> {
    const info = await this.transport.sendMail({ from: env.SMTP_FROM, to: m.to, subject: m.title, text: m.body });
    return { providerMessageId: info.messageId };
  }
}

/** WhatsApp Business Cloud API — optional, requires approved templates in production. */
class WhatsAppProvider implements ChannelProvider {
  readonly name = 'whatsapp';
  async send(m: OutboundMessage): Promise<DeliveryResult> {
    const json = await postJson(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      { messaging_product: 'whatsapp', to: m.to.replace(/^\+/, ''), type: 'text', text: { body: m.body } },
      { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    );
    const msgs = json.messages as Array<{ id: string }> | undefined;
    return { providerMessageId: msgs?.[0]?.id };
  }
}

function pushConfig(): { provider: string; accessToken?: string } {
  try {
    return JSON.parse(env.PUSH_NOTIFICATION_CONFIG) as { provider: string; accessToken?: string };
  } catch {
    return { provider: 'expo' };
  }
}

let cache: Record<string, ChannelProvider> | undefined;

export function getProviders(): Record<'PUSH' | 'SMS' | 'EMAIL' | 'WHATSAPP', ChannelProvider> {
  if (cache) return cache as ReturnType<typeof getProviders>;
  const push = pushConfig();
  cache = {
    PUSH: env.NODE_ENV === 'test' ? new ConsoleProvider('push') : push.provider === 'expo' ? new ExpoPushProvider(push.accessToken) : new ConsoleProvider('push'),
    SMS: env.SMS_PROVIDER === 'termii' && env.SMS_API_KEY ? new TermiiSmsProvider() : new ConsoleProvider('sms'),
    EMAIL: env.SMTP_HOST ? new SmtpEmailProvider() : new ConsoleProvider('email'),
    WHATSAPP: env.WHATSAPP_ENABLED && env.WHATSAPP_ACCESS_TOKEN ? new WhatsAppProvider() : new ConsoleProvider('whatsapp'),
  };
  return cache as ReturnType<typeof getProviders>;
}

/** Test hook. */
export function setProviderForTests(channel: 'PUSH' | 'SMS' | 'EMAIL' | 'WHATSAPP', provider: ChannelProvider): void {
  getProviders()[channel] = provider;
}
