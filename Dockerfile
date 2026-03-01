# ─── Stage 1: Dependencies ────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Stage 2: Build ──────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
# cache-bust: v2

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output)
# Dummy DATABASE_URL satisfies import-time checks during build.
# The real value is injected at runtime by Railway.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

# ─── Stage 3: Production ─────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migrations (for migrate deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=builder /app/src/generated ./src/generated

# Copy node_modules for Prisma runtime + external packages (rainbow-node-sdk)
COPY --from=deps /app/node_modules ./node_modules

# Copy scripts and startup
COPY --from=builder /app/scripts ./scripts
COPY start.sh ./start.sh

USER nextjs

EXPOSE 3000

CMD ["sh", "start.sh"]
