# ── Build ────────────────────────────────────────────────────────────────
# TypeScript is compiled to dist/ here; the runtime image never ships tsc.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────
# node:sqlite is used by the API, so the runtime must be Node 22.5+.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4001

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Seed script: `docker exec <container> node scripts/init.js --force`
COPY scripts/ ./scripts/

RUN mkdir -p /data

EXPOSE 4001

CMD ["node", "dist/index.js"]
