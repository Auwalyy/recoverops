/**
 * Provider-agnostic AI interface. Gemini is the first implementation; others (or a
 * self-hosted model) can be added without touching feature code.
 */
export interface AiInlineData {
  mimeType: string;
  base64: string;
}

export interface AiGenerateRequest {
  systemInstruction: string;
  /** Untrusted content must already be wrapped/delimited by the prompt builder. */
  userContent: string;
  inlineData?: AiInlineData;
  /** Request a JSON response (validated by the caller with Zod). */
  json: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AiGenerateResult {
  text: string;
  model: string;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  isAvailable(): boolean;
  generate(req: AiGenerateRequest): Promise<AiGenerateResult>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'UNAVAILABLE' | 'TIMEOUT' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'BLOCKED',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
