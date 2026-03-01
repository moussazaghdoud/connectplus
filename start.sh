#!/bin/sh
set -e

echo "=== ConnectPlus Startup ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "DATABASE_URL present: $(test -n "$DATABASE_URL" && echo yes || echo no)"
echo "ENCRYPTION_KEY present: $(test -n "$ENCRYPTION_KEY" && echo yes || echo no)"

echo "=== Files check ==="
ls -la server.js 2>&1 || echo "server.js NOT FOUND"
ls -la node_modules/.prisma 2>&1 || echo ".prisma NOT FOUND"

echo "=== Running Prisma Migrate ==="
npx prisma migrate deploy 2>&1 || echo "WARNING: migrate failed, continuing..."

echo "=== Starting Next.js ==="
exec node server.js
