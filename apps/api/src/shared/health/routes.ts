import net from "net";
import type { FastifyInstance } from "fastify";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getPublicPrismaClient } from "../database/index.js";

async function checkDb(): Promise<boolean> {
  try {
    await getPublicPrismaClient().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function checkTcp(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function checkRedis(): Promise<boolean> {
  try {
    const url = new URL(process.env["REDIS_URL"] ?? "redis://localhost:6379");
    return checkTcp(url.hostname, Number(url.port) || 6379);
  } catch {
    return false;
  }
}

async function checkS3(): Promise<boolean> {
  const endpoint = process.env["S3_ENDPOINT"];
  if (!endpoint) return true; // Not configured — skip
  try {
    const client = new S3Client({
      endpoint,
      region: process.env["S3_REGION"] ?? "af-south-1",
      credentials: {
        accessKeyId: process.env["S3_ACCESS_KEY_ID"] ?? "",
        secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] ?? "",
      },
      forcePathStyle: process.env["S3_FORCE_PATH_STYLE"] === "true",
    });
    await client.send(new HeadBucketCommand({ Bucket: process.env["S3_BUCKET"] ?? "l2l-documents" }));
    return true;
  } catch (err) {
    // Bucket not found means S3 is reachable but bucket missing — still counts as degraded.
    const code = (err as { name?: string }).name;
    if (code === "NoSuchBucket" || code === "NotFound") return false;
    return false;
  }
}

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Full health check — DB + Redis + S3. Used by Better Stack uptime monitor.
  fastify.get("/health", async (_, reply) => {
    const [db, redis, s3] = await Promise.all([checkDb(), checkRedis(), checkS3()]);
    const ok = db && redis && s3;
    return reply
      .code(ok ? 200 : 503)
      .send({ status: ok ? "ok" : "degraded", checks: { db, redis, s3 } });
  });

  // Readiness probe — used by ECS to gate traffic. Only checks DB (migrations must have run).
  fastify.get("/health/ready", async (_, reply) => {
    const db = await checkDb();
    return reply.code(db ? 200 : 503).send({ ready: db });
  });
}
