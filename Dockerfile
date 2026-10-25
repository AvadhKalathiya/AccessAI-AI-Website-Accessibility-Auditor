# ==============================================================================
# AccessAI Production Multi-Stage Dockerfile
# ==============================================================================
# Stages:
# 1. builder: Installs build tools, builds better-sqlite3 native bindings, Next.js build
# 2. runner: Lean Debian image with Chromium dependencies, Playwright browser,
#            persistent SQLite volume, non-root user execution, and entrypoint migrations.
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Bundle
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install native compilation dependencies for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

# Clean reproducible dependency install
RUN npm ci

# Copy application source code
COPY . .

# Compile production Next.js bundle
ENV NODE_ENV=production
RUN npm run build

# Prune devDependencies to keep runtime modules minimal
# (tsx is kept in dependencies or devDeps for db:migrate)
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies: Chromium system libraries, dumb-init, curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    curl \
    ca-certificates \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Set up non-root node user directory permissions
RUN mkdir -p /app/data /home/node/.cache \
    && chown -R node:node /app /home/node

# Copy built application and runtime dependencies from builder
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

# Switch to unprivileged user
USER node

# Install Playwright Chromium into user directory
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright
RUN npx playwright install chromium

# Runtime environment defaults
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/app/data/accessai.db \
    OLLAMA_BASE_URL=http://host.docker.internal:11434 \
    OLLAMA_MODEL=llama3.2 \
    OLLAMA_TIMEOUT_MS=25000

# Declare persistent volume mount for SQLite database
VOLUME ["/app/data"]

EXPOSE 3000

# Health check against /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["/usr/bin/dumb-init", "--", "/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
