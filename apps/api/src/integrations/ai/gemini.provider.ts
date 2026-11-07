import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiProvider } from './ai-provider.interface';

/**
 * Google Gemini provider (official @google/genai SDK). Server-side only — the API key
 * never leaves the backend. Implements timeout and bounded retries with backoff.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model = env.GEMINI_MODEL;
  private client: GoogleGenAI | undefined;

  constructor(private readonly apiKey = env.GEMINI_API_KEY) {
    if (apiKey) this.client = new GoogleGenAI({ apiKey });
  }

  isAvailable(): boolean {
    return !!this.client;
  }

  async generate(req: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!this.client) throw new AiProviderError('Gemini is not configured', 'UNAVAILABLE');
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= env.AI_MAX_RETRIES) {
      const started = Date.now();
      try {
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: req.userContent }];
        if (req.inlineData) parts.push({ inlineData: { mimeType: req.inlineData.mimeType, data: req.inlineData.base64 } });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
        try {
          const response = await this.client.models.generateContent({
            model: this.model,
            contents: [{ role: 'user', parts }],
            config: {
              systemInstruction: req.systemInstruction,
              temperature: req.temperature ?? 0.1,
              maxOutputTokens: req.maxOutputTokens ?? 1024,
              responseMimeType: req.json ? 'application/json' : 'text/plain',
              abortSignal: controller.signal,
            },
          });
          const text = response.text ?? '';
          if (!text) throw new AiProviderError('Empty or blocked response', 'BLOCKED');
          return { text, model: this.model, latencyMs: Date.now() - started };
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastErr = err;
        const message = (err as Error)?.message ?? '';
        const status = (err as { status?: number }).status;
        if (err instanceof AiProviderError && err.kind === 'BLOCKED') throw err;
        const retryable = (err as Error)?.name === 'AbortError' || status === 429 || (status !== undefined && status >= 500) || /timeout|ECONNRESET|fetch failed/i.test(message);
        if (!retryable || attempt === env.AI_MAX_RETRIES) break;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        attempt++;
      }
    }
    const e = lastErr as { name?: string; status?: number; message?: string };
    if (e?.name === 'AbortError') throw new AiProviderError('AI request timed out', 'TIMEOUT');
    if (e?.status === 429) throw new AiProviderError('AI provider rate limit reached', 'RATE_LIMITED');
    throw new AiProviderError(`AI provider error: ${e?.message ?? 'unknown'}`, 'PROVIDER_ERROR');
  }
}
