# -- Stage 1: Build ------------------------------------------------------------
FROM oven/bun:1.4.0-alpine AS builder

WORKDIR /workspace

# Copy workspace-level config first (layer cache: these change rarely)
COPY package.json bun.lock ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy shared package (used by frontend via @finplan/shared alias)
COPY packages/shared ./packages/shared/

# Copy workspace package.json files so bun can resolve all workspaces (apps/*)
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/backend/package.json ./apps/backend/

# Install all workspace dependencies; --ignore-scripts prevents the backend's
# postinstall (prisma generate) from running here — prisma is not needed in
# the frontend build. Override NODE_ENV so devDeps are always installed even
# if Coolify injects NODE_ENV=production at build time.
RUN NODE_ENV=development bun install --ignore-scripts

# Copy frontend source and config files
WORKDIR /workspace/apps/frontend
COPY apps/frontend/src ./src/
COPY apps/frontend/*.html ./
COPY apps/frontend/tsconfig*.json ./
COPY apps/frontend/*.config.* ./

# Build shared package first so tsc can resolve @finplan/shared types
# (packages/shared/dist/ is gitignored and won't be in the build context)
WORKDIR /workspace/packages/shared
RUN bun run build

# Build -- runs `tsc && vite build`, output goes to /workspace/apps/frontend/dist
WORKDIR /workspace/apps/frontend
RUN bun run build

# -- Stage 2: Serve ------------------------------------------------------------
FROM nginx:alpine

# Copy built static files
COPY --from=builder --chown=nginx:nginx /workspace/apps/frontend/dist /usr/share/nginx/html

# Replace default nginx config with ours (proxy rules + SPA fallback)
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf


EXPOSE 3000

# nginx starts automatically via the base image CMD
