import { z } from 'zod';

/**
 * Environment configuration, validated once at startup. The process refuses to boot
 * with an invalid configuration — and refuses insecure defaults in production.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    API_BASE_URL: z.url().default('http://localhost:4000'),
    APP_BASE_URL: z.string().default('recoveros://'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/recoveros?replicaSet=rs0'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    /** `bullmq` in deployed environments; `inline` runs jobs in-process (tests / no-Redis dev). */
    QUEUE_DRIVER: z.enum(['bullmq', 'inline']).default('bullmq'),
    /** Run BullMQ workers inside the API process (convenient for local dev). */
    RUN_WORKERS_IN_API: bool.default(true),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ISSUER: z.string().default('recoveros-api'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Secret used to sign expiring document-download links. */
    FILE_URL_SIGNING_SECRET: z.string().min(32).optional(),

    CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
    AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

    STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('./.storage'),
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().default('recoveros-private'),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_FORCE_PATH_STYLE: bool.default(true),
    MAX_UPLOAD_MB: z.coerce.number().min(1).max(50).default(10),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('RecoverOS <no-reply@recoveros.local>'),

    SMS_PROVIDER: z.enum(['console', 'termii', 'africastalking', 'twilio']).default('console'),
    SMS_API_KEY: z.string().optional(),
    SMS_SENDER_ID: z.string().default('RecoverOS'),
    WHATSAPP_ENABLED: bool.default(false),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    /** JSON: {"provider":"expo","accessToken":"..."} — Expo push service is used by default. */
    PUSH_NOTIFICATION_CONFIG: z.string().default('{"provider":"expo"}'),

    PAYMENT_PROVIDER: z.enum(['manual', 'paystack', 'flutterwave']).default('manual'),
    PAYMENT_SECRET_KEY: z.string().optional(),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(20),

    ENABLE_SWAGGER: bool.default(true),
    /** Exposes dev-only conveniences (e.g. logging one-time codes). Forced off in production. */
    DEV_EXPOSE_OTP: bool.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const weak = (s: string) => /change[-_]?me|dev[-_]?secret|example|test/i.test(s);
    if (weak(env.JWT_ACCESS_SECRET) || weak(env.JWT_REFRESH_SECRET)) {
      ctx.addIssue({ code: 'custom', message: 'Production JWT secrets look like placeholders', path: ['JWT_ACCESS_SECRET'] });
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'Access and refresh secrets must differ', path: ['JWT_REFRESH_SECRET'] });
    }
    if (!env.FILE_URL_SIGNING_SECRET) {
      ctx.addIssue({ code: 'custom', message: 'FILE_URL_SIGNING_SECRET is required in production', path: ['FILE_URL_SIGNING_SECRET'] });
    }
    if (env.QUEUE_DRIVER === 'inline') {
      ctx.addIssue({ code: 'custom', message: 'QUEUE_DRIVER=inline is not allowed in production', path: ['QUEUE_DRIVER'] });
    }
    if (env.STORAGE_DRIVER === 'local') {
      ctx.addIssue({ code: 'custom', message: 'STORAGE_DRIVER=local is not allowed in production', path: ['STORAGE_DRIVER'] });
    }
    if (env.CORS_ORIGINS.split(',').some((o) => o.trim() === '*')) {
      ctx.addIssue({ code: 'custom', message: 'Wildcard CORS is not allowed in production', path: ['CORS_ORIGINS'] });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    // Logger is not configured yet; write directly to stderr and stop.
    process.stderr.write(`\nInvalid RecoverOS environment configuration:\n${issues}\n\n`);
    throw new Error('Invalid environment configuration');
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') env.DEV_EXPOSE_OTP = false;
  return env;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
export const fileSigningSecret = env.FILE_URL_SIGNING_SECRET ?? `${env.JWT_REFRESH_SECRET}:files`;
