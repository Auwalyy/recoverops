import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins, env, isProduction } from './config/env';
import { logger } from './config/logger';
import { requestContext } from './middleware/context';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { apiRateLimit } from './middleware/rate-limit';
import { apiRouter } from './routes';
import { healthRouter } from './modules/health/health.routes';
import { buildOpenApiDocument } from './docs/openapi';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => String(res.locals.requestId ?? ''),
      // Never log bodies (may contain clinical content) — only method/path/status/timing.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split('?')[0] }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Native mobile clients send no Origin header; browsers must be allow-listed.
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-Hospital-Id', 'X-Acting-As', 'Idempotency-Key'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  // Bearer tokens (not cookies) are used, so classic CSRF does not apply; we still
  // reject form-encoded bodies to avoid cross-site simple-request submissions.
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.is('application/x-www-form-urlencoded')) {
      res.status(415).json({ success: false, error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use application/json' } });
      return;
    }
    next();
  });

  app.use('/health', healthRouter);

  if (env.ENABLE_SWAGGER) {
    const doc = buildOpenApiDocument();
    app.get('/api/docs.json', (_req, res) => res.json(doc));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'RecoverOS API' }));
  }

  app.use('/api/v1', apiRateLimit, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
