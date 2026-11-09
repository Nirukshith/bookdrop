# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

# Install openssl for Prisma CLI and engines
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

COPY tsconfig*.json nest-cli.json ./
COPY src ./src/

# Compile TypeScript
RUN npm run build

# Prune devDependencies
RUN npm prune --omit=dev

# ==========================================
# Stage 2: Final Production Runner Stage
# ==========================================
FROM node:22-slim AS runner

WORKDIR /app

RUN apt-get update -y && apt-get upgrade -y --no-install-recommends && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy node_modules (production dependencies and Prisma client)
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma

RUN chown -R node:node /app

# Run as non-root user
USER node

EXPOSE 3001

CMD ["node", "dist/main"]
