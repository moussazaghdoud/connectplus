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

echo "=== Seeding Marketplace Data ==="
if [ -f prisma/seed-marketplace.ts ]; then
  npx tsx prisma/seed-marketplace.ts 2>&1 || echo "WARNING: marketplace seed failed, continuing..."
else
  echo "Seed script not found, skipping."
fi

# Rainbow S2S sessions are now user-initiated from the /agent page.
# Each agent provides their own credentials — no env-var worker needed.

echo "=== Starting Next.js ==="
exec node server.js
