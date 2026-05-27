FROM node:20-alpine

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package*.json tsconfig.base.json ./
COPY apps/api/package*.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY packages/shared-schemas/package*.json packages/shared-schemas/
COPY packages/shared-types/package*.json packages/shared-types/

RUN npm ci

# Copy source after deps are installed
COPY apps/api/src apps/api/src
COPY apps/api/prisma apps/api/prisma
COPY packages/shared-schemas/src packages/shared-schemas/src
COPY packages/shared-types/src packages/shared-types/src

# Generate Prisma clients (public + tenant)
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx prisma generate --schema prisma/tenant/schema.prisma

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
