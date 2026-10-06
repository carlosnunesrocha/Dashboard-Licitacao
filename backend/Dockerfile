FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
# O schema versionado usa SQLite (dev local). A imagem de produção roda em Postgres.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
 && npx prisma generate \
 && npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# curl: o adaptador do LicitarDigital delega o transporte ao curl (ver licitar-digital.client.ts).
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./

USER node
EXPOSE 3001

# db push sem --accept-data-loss: recusa qualquer mudança destrutiva de schema.
# O seed é idempotente (ignora se o admin já existe).
CMD ["sh", "-c", "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && node dist/main"]
