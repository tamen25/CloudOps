#Storefront Dockerfile — Next.js 15 App Router, output: 'standalone'.
#Three-stage build mirrors apps/order-api/Dockerfile (closes backlog #79).

#1. Builder — install ALL deps and run `next build`. Standalone output drops
#   into .next/standalone with a self-contained server.js and trimmed
#   node_modules. .next/static is copied separately into the runtime image.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts ./
COPY src ./src
COPY public ./public
RUN npm ci
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

#2. Runtime — non-root, standalone server + static assets only.
FROM node:22-alpine
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

#Standalone output bundles node_modules + a minimal server.js.
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /app/public ./public

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
