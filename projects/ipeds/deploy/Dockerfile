# Multi-service Dockerfile for IPEDS Explorer
# Runs PostgreSQL (with pgvector, PostGIS, pg_trgm) + Node.js API + static UI
# Uses s6-overlay for process supervision

FROM pgvector/pgvector:pg16 AS base

# Install Node.js, s6-overlay, and PostGIS
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    postgresql-16-postgis-3 \
    postgresql-16-postgis-3-scripts \
    postgresql-16-similarity \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install s6-overlay for process supervision
ARG S6_OVERLAY_VERSION=3.1.6.2
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-noarch.tar.xz /tmp
ADD https://github.com/just-containers/s6-overlay/releases/download/v${S6_OVERLAY_VERSION}/s6-overlay-x86_64.tar.xz /tmp
RUN tar -C / -Jxpf /tmp/s6-overlay-noarch.tar.xz \
    && tar -C / -Jxpf /tmp/s6-overlay-x86_64.tar.xz \
    && rm /tmp/s6-overlay-*.tar.xz

# Build stage for Node.js app
FROM base AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build || npx tsc

# Build UI
COPY ui/package*.json ./ui/
RUN cd ui && npm ci

COPY ui/ ./ui/
RUN cd ui && npm run build

# Final image
FROM base

# Create directories
RUN mkdir -p /app /data/postgres /run/postgresql \
    && chown -R postgres:postgres /data/postgres /run/postgresql

WORKDIR /app

# Copy built Node.js app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy built UI to be served as static files
COPY --from=builder /app/ui/dist ./ui/dist

# Copy s6 service definitions
COPY deploy/s6-rc.d /etc/s6-overlay/s6-rc.d

# PostgreSQL init scripts for extensions
COPY deploy/postgres-init.sql /docker-entrypoint-initdb.d/

# Environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/datagoose \
    PGDATA=/data/postgres \
    POSTGRES_USER=postgres \
    POSTGRES_PASSWORD=postgres \
    POSTGRES_DB=datagoose

# Expose port (Fly.io uses 8080 by default)
EXPOSE 8080

# s6-overlay entrypoint
ENTRYPOINT ["/init"]
