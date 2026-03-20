FROM node:20-slim AS builder

WORKDIR /app

# Build the static frontend
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Set up the self-hosted server
FROM node:20-slim

WORKDIR /app/selfhosted

# Copy the built static output
COPY --from=builder /app/out /app/out

# Install server dependencies
COPY selfhosted/package.json selfhosted/package-lock.json* ./
RUN npm ci --omit=dev

# Copy server source
COPY selfhosted/src ./src
COPY selfhosted/tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p /app/selfhosted/data

ENV PORT=3001
ENV STATIC_DIR=/app/out
ENV DB_PATH=/app/selfhosted/data/agent-render.db
ENV BASE_URL=http://localhost:3001

EXPOSE 3001

VOLUME ["/app/selfhosted/data"]

CMD ["npm", "start"]
