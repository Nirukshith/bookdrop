# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

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

RUN apt-get update -y && apt-get upgrade -y --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Copy node_modules and dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/dist ./dist

RUN chown -R node:node /app

# Run as non-root user
USER node

EXPOSE 3000

CMD ["node", "dist/main"]
