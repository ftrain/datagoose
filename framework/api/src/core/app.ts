/**
 * Express Application Factory
 *
 * Creates a configured Express app with common middleware.
 * Projects extend this with their own routes.
 */

import express, { Application, Router, RequestHandler, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

export interface AppConfig {
  /** Enable CORS (default: true) */
  cors?: boolean;
  /** Enable Helmet security (default: true) */
  helmet?: boolean;
  /** Disable CSP for development (default: true in dev) */
  disableCSP?: boolean;
  /** Disable HSTS for development (default: true in dev) */
  disableHSTS?: boolean;
  /** JSON body limit (default: '10mb') */
  jsonLimit?: string;
  /** Trust proxy (default: false) */
  trustProxy?: boolean;
}

export interface SwaggerConfig {
  /** OpenAPI specification object */
  spec: object;
  /** Path to serve spec JSON (default: '/api/spec') */
  specPath?: string;
  /** Path to serve Swagger UI (default: '/api/docs') */
  docsPath?: string;
}

const defaultConfig: AppConfig = {
  cors: true,
  helmet: true,
  disableCSP: process.env.NODE_ENV !== 'production',
  disableHSTS: process.env.NODE_ENV !== 'production',
  jsonLimit: '10mb',
  trustProxy: false,
};

/**
 * Create a configured Express application
 */
export function createApp(config: AppConfig = {}): Application {
  const app = express();
  const mergedConfig = { ...defaultConfig, ...config };

  // Trust proxy if configured
  if (mergedConfig.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Security middleware
  if (mergedConfig.helmet) {
    app.use(
      helmet({
        contentSecurityPolicy: mergedConfig.disableCSP ? false : undefined,
        hsts: mergedConfig.disableHSTS ? false : undefined,
      })
    );
  }

  // CORS
  if (mergedConfig.cors) {
    app.use(cors());
  }

  // Body parsing
  app.use(express.json({ limit: mergedConfig.jsonLimit }));
  app.use(express.urlencoded({ extended: true }));

  return app;
}

/**
 * Add Swagger documentation to an Express app
 */
export function addSwagger(app: Application, config: SwaggerConfig): void {
  const { spec, specPath = '/api/spec', docsPath = '/api/docs' } = config;

  // Serve spec as JSON
  app.get(specPath, (_req, res) => res.json(spec));

  // Serve Swagger UI
  app.use(docsPath, swaggerUi.serve, swaggerUi.setup(spec));
}

/**
 * Add routes to an Express app with a base path
 */
export function addRoutes(
  app: Application,
  basePath: string,
  router: Router
): void {
  app.use(basePath, router);
}

/**
 * Add error handler to an Express app (should be added last)
 */
export function addErrorHandler(
  app: Application,
  handler: ErrorRequestHandler
): void {
  app.use(handler);
}

/**
 * Start the Express server
 */
export function startServer(
  app: Application,
  port: number | string,
  callback?: () => void
): void {
  const numPort = typeof port === 'string' ? parseInt(port, 10) : port;

  app.listen(numPort, () => {
    if (callback) {
      callback();
    } else {
      console.log(`Server running at http://localhost:${numPort}`);
    }
  });
}
