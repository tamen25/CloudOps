#This Dockerfile builds the apps order API container image.
#Multi-stage build: compile TypeScript in builder, ship only dist + prod
#deps in the runtime image. Closes backlog #64.

#1. Builder — install ALL deps (incl. typescript) and compile to dist/.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

#2. Prod-deps — install ONLY production deps for the runtime image.
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

#3. Runtime — non-root, only compiled output + prod deps.
FROM node:22-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --chown=nodejs:nodejs migrations ./migrations
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "dist/server.js"]
