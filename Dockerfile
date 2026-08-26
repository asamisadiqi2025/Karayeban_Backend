FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++ openssl libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

ENV DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/karayeban"
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/karayeban"
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker-entrypoint.sh ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN chmod +x docker-entrypoint.sh && chown -R node:node /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/ >/dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
