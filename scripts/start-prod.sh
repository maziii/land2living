#!/bin/sh
set -e

echo "→ Running public schema migrations..."
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "→ Starting API..."
node apps/api/dist/index.js
