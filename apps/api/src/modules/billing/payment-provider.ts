import { env, isProduction } from '../../config/env';

/**
 * Payment-provider abstraction. RecoverOS does not assume any provider is configured.
 * `manual` supports bank-transfer / offline payment recorded by a platform operator.
 * Paystack/Flutterwave adapters plug in here once credentials and webhooks exist.
 */
export interface PaymentProvider {
  readonly name: string;
  createPaymentLink(input: { invoiceNumber: string; amountMinor: number; currency: string }): Promise<{ reference: string; url?: string }>;
  verifyPayment(reference: string): Promise<boolean>;
}

class ManualPaymentProvider implements PaymentProvider {
  readonly name = 'manual';
  async createPaymentLink(input: { invoiceNumber: string }) {
    return { reference: `MANUAL-${input.invoiceNumber}` };
  }
  /** Manual payments are confirmed by an authorised operator recording the payment. */
  async verifyPayment(): Promise<boolean> {
    return true;
  }
}

class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  async createPaymentLink(input: { invoiceNumber: string; amountMinor: number; currency: string }) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.PAYMENT_SECRET_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, reference: input.invoiceNumber, email: 'billing@recoveros.local' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Paystack HTTP ${res.status}`);
    const json = (await res.json()) as { data: { reference: string; authorization_url: string } };
    return { reference: json.data.reference, url: json.data.authorization_url };
  }
  async verifyPayment(reference: string) {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${env.PAYMENT_SECRET_KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { data?: { status?: string } };
    return json.data?.status === 'success';
  }
}

export function getPaymentProvider(): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'paystack' && env.PAYMENT_SECRET_KEY) return new PaystackProvider();
  if (env.PAYMENT_PROVIDER !== 'manual' && isProduction) {
    throw new Error(`Payment provider ${env.PAYMENT_PROVIDER} is not configured`);
  }
  return new ManualPaymentProvider();
}
