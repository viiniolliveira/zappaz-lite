FROM oven/bun:1.4.4 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Prisma config needs a URL to load, but generation does not connect to a database.
RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bun run db:generate
RUN bun --bun run build

FROM oven/bun:1.4.4

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/server ./server
COPY --from=build --chown=bun:bun /app/shared ./shared
COPY --from=build --chown=bun:bun /app/dist ./dist

RUN mkdir -p /app/storage/media && chown -R bun:bun /app/storage

USER bun
ENV NODE_ENV=production

EXPOSE 3001

CMD ["sh", "-c", "bun run db:migrate:deploy && exec bun run start"]
