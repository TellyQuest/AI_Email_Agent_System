# Base stage with pnpm
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/core/package.json ./packages/core/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY apps/dashboard/package.json ./apps/dashboard/

RUN pnpm install --frozen-lockfile

# Build stage
FROM deps AS build
COPY . .
RUN pnpm build

# Server production stage
FROM base AS server
ENV NODE_ENV=production

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all packages
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/core/package.json ./packages/core/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/server/package.json ./apps/server/

# Copy built dist folders
COPY --from=build /app/packages/utils/dist ./packages/utils/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/config ./config

# Install production dependencies (this creates proper symlinks)
RUN pnpm install --prod --frozen-lockfile

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]

# Worker production stage
FROM base AS worker
ENV NODE_ENV=production

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy package.json files for all packages
COPY packages/utils/package.json ./packages/utils/
COPY packages/config/package.json ./packages/config/
COPY packages/database/package.json ./packages/database/
COPY packages/core/package.json ./packages/core/
COPY packages/integrations/package.json ./packages/integrations/
COPY apps/worker/package.json ./apps/worker/

# Copy built dist folders
COPY --from=build /app/packages/utils/dist ./packages/utils/dist
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/integrations/dist ./packages/integrations/dist
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/config ./config

# Install production dependencies (this creates proper symlinks)
RUN pnpm install --prod --frozen-lockfile

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

CMD ["node", "apps/worker/dist/index.js"]
