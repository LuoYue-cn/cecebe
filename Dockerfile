FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/prisma ./prisma
# Prisma migrations and TypeScript queue worker share one deployable image.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/src ./src
COPY --from=build --chown=app:app /app/scripts ./scripts
COPY --from=build --chown=app:app /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=app:app /app/package.json ./package.json
RUN chmod -R u+rwX /app/src /app/scripts /app/prisma
RUN mkdir -p /app/public/uploads && chown -R app:app /app/public/uploads
USER app
EXPOSE 3000
CMD ["node", "server.js"]
