# Image de l'API du socle, construite depuis la racine du monorepo :
#   docker build -f apps/api/Dockerfile -t snl-api .

FROM node:22-bookworm-slim AS construction
WORKDIR /depot
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @snl/api --workspace @snl/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @snl/shared && npm run build -w @snl/api \
 && npm prune --omit=dev --workspace @snl/api --workspace @snl/shared

FROM node:22-bookworm-slim AS execution
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
COPY --from=construction /depot/node_modules ./node_modules
COPY --from=construction /depot/packages/shared/package.json ./node_modules/@snl/shared/package.json
COPY --from=construction /depot/packages/shared/dist ./node_modules/@snl/shared/dist
COPY --from=construction /depot/apps/api/dist ./dist
COPY --from=construction /depot/apps/api/prisma ./prisma
COPY --from=construction /depot/apps/api/package.json ./package.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/sante').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
