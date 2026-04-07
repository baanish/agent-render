FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN npx tsc -p selfhosted/tsconfig.json

# ── Production image ──
FROM node:20-slim

WORKDIR /app

RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nodejs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/out ./out
COPY --from=builder /app/selfhosted/dist ./selfhosted/dist

RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

ENV PORT=3000
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/agent-render.db

EXPOSE 3000

USER nodejs

CMD ["node", "selfhosted/dist/server.js"]
