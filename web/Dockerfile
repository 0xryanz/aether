# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Aether Forge web — production image (Next.js standalone)
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time, so they must be build args.
ARG NEXT_PUBLIC_CHAIN_ID=56
ARG NEXT_PUBLIC_AETHER_ADDRESS
ARG NEXT_PUBLIC_RELIC_ADDRESS
ARG NEXT_PUBLIC_LOOM_ADDRESS
ARG NEXT_PUBLIC_FORGE_ADDRESS
ARG NEXT_PUBLIC_MARKET_ADDRESS
ARG NEXT_PUBLIC_REGISTRY_ADDRESS
ARG NEXT_PUBLIC_USDT_ADDRESS
ARG NEXT_PUBLIC_USDT_DECIMALS=18
ARG NEXT_PUBLIC_DEPLOY_BLOCK=0
ARG NEXT_PUBLIC_RPC_URL
ARG NEXT_PUBLIC_DEMO_FAUCET=0
ARG NEXT_PUBLIC_SELF_REGISTER=0

ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_AETHER_ADDRESS=$NEXT_PUBLIC_AETHER_ADDRESS \
    NEXT_PUBLIC_RELIC_ADDRESS=$NEXT_PUBLIC_RELIC_ADDRESS \
    NEXT_PUBLIC_LOOM_ADDRESS=$NEXT_PUBLIC_LOOM_ADDRESS \
    NEXT_PUBLIC_FORGE_ADDRESS=$NEXT_PUBLIC_FORGE_ADDRESS \
    NEXT_PUBLIC_MARKET_ADDRESS=$NEXT_PUBLIC_MARKET_ADDRESS \
    NEXT_PUBLIC_REGISTRY_ADDRESS=$NEXT_PUBLIC_REGISTRY_ADDRESS \
    NEXT_PUBLIC_USDT_ADDRESS=$NEXT_PUBLIC_USDT_ADDRESS \
    NEXT_PUBLIC_USDT_DECIMALS=$NEXT_PUBLIC_USDT_DECIMALS \
    NEXT_PUBLIC_DEPLOY_BLOCK=$NEXT_PUBLIC_DEPLOY_BLOCK \
    NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL \
    NEXT_PUBLIC_DEMO_FAUCET=$NEXT_PUBLIC_DEMO_FAUCET \
    NEXT_PUBLIC_SELF_REGISTER=$NEXT_PUBLIC_SELF_REGISTER \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
