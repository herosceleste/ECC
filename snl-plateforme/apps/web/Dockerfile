# Image de l'interface web, construite depuis la racine du monorepo :
#   docker build -f apps/web/Dockerfile -t snl-web .

FROM node:22-bookworm-slim AS construction
WORKDIR /depot
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @snl/web --workspace @snl/shared --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @snl/shared && npm run build -w @snl/web

FROM node:22-bookworm-slim AS execution
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
# Sortie « standalone » : le serveur et uniquement les dépendances qu'il utilise.
COPY --from=construction --chown=node:node /depot/apps/web/.next/standalone ./
COPY --from=construction --chown=node:node /depot/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/connexion').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
