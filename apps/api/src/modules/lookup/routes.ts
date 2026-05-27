import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../shared/identity/middleware.js";
import * as repo from "./repository.js";
import { AUTHORITY_TYPES, AUTHORITY_TYPE_LABELS, authorityQuerySchema, villageQuerySchema } from "./schemas.js";

export async function lookupRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /lookup/provinces
  fastify.get("/provinces", { preHandler: [requireAuth] }, async (_request, reply) => {
    const provinces = await repo.listProvinces();
    return reply.code(200).send({ provinces });
  });

  // GET /lookup/authority-types
  fastify.get("/authority-types", { preHandler: [requireAuth] }, async (_request, reply) => {
    const types = AUTHORITY_TYPES.map(value => ({ value, label: AUTHORITY_TYPE_LABELS[value] }));
    return reply.code(200).send({ types });
  });

  // GET /lookup/authorities?provinceId=&type=
  fastify.get("/authorities", { preHandler: [requireAuth] }, async (request, reply) => {
    const query = authorityQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ type: "about:blank", title: "Bad Request", status: 400, detail: "Invalid query" });
    }
    const authorities = await repo.listAuthorities({
      ...(query.data.provinceId !== undefined && { provinceId: query.data.provinceId }),
      ...(query.data.type !== undefined       && { type: query.data.type }),
    });
    return reply.code(200).send({ authorities });
  });

  // GET /lookup/villages?authorityId=
  fastify.get("/villages", { preHandler: [requireAuth] }, async (request, reply) => {
    const query = villageQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ type: "about:blank", title: "Bad Request", status: 400, detail: "authorityId (UUID) is required" });
    }
    const villages = await repo.listVillages(query.data.authorityId);
    return reply.code(200).send({ villages });
  });
}
