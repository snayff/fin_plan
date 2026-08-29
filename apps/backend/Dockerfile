FROM oven/bun:1.4.0-alpine

WORKDIR /workspace

# Copy workspace-level config (layer cache: these change rarely)
COPY package.json bun.lock ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy shared package
COPY packages/shared ./packages/shared/

# Copy workspace package.json files so bun can resolve all workspaces (apps/*)
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

# Copy prisma schema and config before bun install; the postinstall hook
# (prisma generate) needs both the schema and prisma.config.ts
COPY apps/backend/prisma ./apps/backend/prisma/
COPY apps/backend/prisma.config.ts ./apps/backend/

# Install all deps; skip lifecycle scripts so prisma generate runs as a
# separate step (clearer errors, no DATABASE_URL needed at install time).
# Override NODE_ENV so devDeps (prisma CLI) are installed even if
# Coolify injects NODE_ENV=production at build time.
RUN NODE_ENV=development bun install --ignore-scripts

# Generate Prisma client explicitly after deps are installed
RUN cd /workspace/apps/backend && bunx prisma generate

# Build shared package so @finplan/shared resolves at runtime
# (packages/shared/dist/ is gitignored and won't be in the build context)
WORKDIR /workspace/packages/shared
RUN bun run build

# Switch to backend dir for remaining COPY steps
WORKDIR /workspace/apps/backend

# Copy backend source code and scripts
COPY apps/backend/src ./src/
COPY apps/backend/scripts ./scripts/
COPY apps/backend/tsconfig.json ./

RUN addgroup -g 1001 finplan && adduser -D -u 1001 -G finplan finplan
RUN chown -R finplan:finplan /workspace
USER finplan

EXPOSE 3001

CMD ["bun", "src/server.ts"]
