# TennisAI API image.
#
# Debian slim rather than Alpine on purpose: Prisma's query engine needs
# OpenSSL, and the musl build is the one that goes wrong quietly — it fails at
# the first query, not at build time, which is the worst place to find out.
FROM node:20-slim

# openssl for Prisma's engine, ca-certificates so outbound TLS (Gmail SMTP,
# the AI provider) works at all.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dev dependencies are kept: `npm start` runs the TypeScript entrypoint through
# tsx, and `migrate:deploy` needs the prisma CLI at container start.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Not published to the host — only Caddy talks to this, over the compose network.
CMD ["sh", "-c", "npm run migrate:deploy && npm start"]
