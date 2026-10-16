# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

# Install openssl for Prisma CLI and engines
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install all dependencies (development + production)
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client for current and linux/amd64 targets
RUN npx prisma generate

# Copy source code and build configs
COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile TypeScript into production bundle (dist/)
RUN npm run build

# Prune devDependencies and retain Prisma CLI for production migrations/bootstrap
RUN npm prune --omit=dev && npm install prisma@6.19.3 --no-save

# ==========================================
# Stage 2: Final Production Runner Stage
# ==========================================
FROM node:22-slim AS runner

WORKDIR /app

# Install runtime dependencies and security updates: OpenSSL (for Prisma), curl (for health checks)
RUN apt-get update -y && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*


ENV NODE_ENV=production
ENV PORT=3000

# Copy node_modules (production dependencies, Prisma client, and Prisma CLI)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/src/schema.gql ./src/schema.gql

RUN chown -R node:node /app

# Run as non-root user for security
USER node

# Expose default HTTP port
EXPOSE 3000

# Liveness probe healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health/live || exit 1

# Default command starts the application only (migrations must be run out-of-band to prevent race conditions)
CMD ["node", "dist/main.js"]
