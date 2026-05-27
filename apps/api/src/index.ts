import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import fmultipart from "@fastify/multipart";
import { authRoutes } from "./shared/identity/index.js";
import { auditRoutes } from "./shared/audit/index.js";
import { documentRoutes } from "./shared/documents/index.js";
import { healthRoutes } from "./shared/health/routes.js";
import { residentRoutes } from "./modules/register/residents/index.js";
import { standRoutes } from "./modules/register/stands/index.js";
import { occupancyRoutes } from "./modules/register/occupancies/index.js";
import { applicationRoutes } from "./modules/applications/index.js";
import { lookupRoutes } from "./modules/lookup/index.js";
import { ptoRoutes } from "./modules/register/ptos/index.js";
import { resaleRoutes, pspWebhookRoutes } from "./modules/resale/index.js";
import { servicesRoutes } from "./modules/services/index.js";
import { providerRoutes } from "./modules/providers/index.js";
import { supplierRoutes, supplierWebhookRoutes, startSupplierDispatchWorker } from "./modules/suppliers/index.js";
import { startNotificationWorker } from "./shared/notifications/queue.js";

// Sentry must be initialised before any other imports are used at runtime.
// No-op when SENTRY_DSN is unset (local dev).
Sentry.init({
  dsn: process.env["SENTRY_DSN"] || undefined,
  environment: process.env["NODE_ENV"] ?? "development",
  // Capture 100% of traces in dev; tune down in production via SENTRY_TRACES_SAMPLE_RATE.
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 1.0,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set`);
  return value;
}

const isDev = process.env["NODE_ENV"] !== "production";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env["LOG_LEVEL"] ?? "info",
      ...(isDev
        ? {
            transport: {
              target: "pino-pretty",
              options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    // Use incoming X-Request-ID if provided; otherwise generate a UUID.
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  });

  // Wire Sentry's Fastify error handler so unhandled exceptions are captured.
  Sentry.setupFastifyErrorHandler(app);

  void app.register(fjwt, { secret: requireEnv("JWT_SECRET") });
  void app.register(fmultipart, { limits: { fileSize: 10_485_760 } }); // 10 MB

  void app.register(healthRoutes, { prefix: "/api/v1" });
  void app.register(authRoutes, { prefix: "/api/v1/auth" });
  void app.register(auditRoutes, { prefix: "/api/v1/audit-events" });
  void app.register(documentRoutes, { prefix: "/api/v1" });
  void app.register(residentRoutes, { prefix: "/api/v1/residents" });
  void app.register(standRoutes, { prefix: "/api/v1/stands" });
  void app.register(occupancyRoutes, { prefix: "/api/v1" });
  void app.register(lookupRoutes,      { prefix: "/api/v1/lookup" });
  void app.register(applicationRoutes, { prefix: "/api/v1/applications" });
  void app.register(ptoRoutes, { prefix: "/api/v1" });
  void app.register(resaleRoutes, { prefix: "/api/v1" });
  void app.register(pspWebhookRoutes, { prefix: "/api/v1" });
  void app.register(servicesRoutes, { prefix: "/api/v1" });
  void app.register(providerRoutes, { prefix: "/api/v1" });
  void app.register(supplierRoutes, { prefix: "/api/v1" });
  void app.register(supplierWebhookRoutes, { prefix: "/api/v1" });

  return app;
}

// Start the server only when run directly (not when imported by tests).
if (process.argv[1] !== undefined) {
  const url = new URL(import.meta.url);
  const isMain = url.pathname.endsWith(process.argv[1].replace(/\\/g, "/"));
  if (isMain) {
    const app = buildApp();
    await app.listen({ port: Number(process.env["PORT"] ?? 3000), host: "0.0.0.0" });
    // Start background workers (Redis required; skipped gracefully if unavailable)
    if (process.env["REDIS_URL"]) {
      startNotificationWorker();
      startSupplierDispatchWorker();
    }
  }
}
