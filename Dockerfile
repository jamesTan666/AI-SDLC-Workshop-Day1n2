# Todo App — Railway deployment image
# Debian-based (glibc) so better-sqlite3 uses its prebuilt native binding.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app ./
# Railway injects PORT; `next start` honours it. Runs as root so the app can
# write todos.db to a Railway volume mount (volumes are root-owned by default).
EXPOSE 3000
CMD ["npm", "start"]
