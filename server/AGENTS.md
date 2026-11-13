# AGENTS.md

## Commands
- Use Bun only; install once with `bun install` at the repository root. Do not create a `server/package.json` or nested lockfile.
- Run every command below from the repository root.
- Start local Postgres and Drizzle Gateway with `bun run db:start`; it uses `docker/docker-compose.dev.yml` and exposes `postgres:postgres@localhost:5432/postgres` on loopback only.
- Generate Prisma client with `bun run db:generate` after install or schema changes. The client is output to gitignored `server/generated/prisma`, and `src` imports `@generated/prisma`.
- Keep Prisma CLI, client, and PostgreSQL adapter aligned on version 7 (`7.8.0`); do not upgrade to version 8.
- Apply dev migrations with `bun run db:migrate:dev`; deploy migrations with `bun run db:migrate:deploy`.
- Main dev server: `bun run dev:backend`. Production command is `bun run start`. Both execute `server/src/app.ts` using Bun and `server/tsconfig.json` aliases.
- `bun run check:backend` is read-only: it runs Biome with the root `biome.json` on `server/src` and the backend typecheck.
- `bun run build:backend` only typechecks; `server/tsconfig.json` has `noEmit: true`.
- Run `bun run test` from the repository root. Frontend-serving route tests live in `test/frontend/`, use isolated fixtures, and do not start the API or access the database.

## Required Env
- `src/config.ts` hard-fails on missing `CLIENT_SECRET` and `DATABASE_URL`.
- Production requires an HTTPS `APP_URL`; derive HTTP/realtime origins and MCP hosts from it. Do not require separate origin allowlist variables or `ADMIN_TOKEN`.
- Read admin credentials from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, not a hardcoded user JSON. Require them for first startup, explicit password reset and manual admin/seed commands; never log the plaintext password. Validate seed credentials before deleting data.
- Prisma CLI and runtime use the same `DATABASE_URL`. Runtime and CLI load the root `.env`.
- On startup, create the first administrator from `ADMIN_EMAIL`/`ADMIN_PASSWORD` only when no users exist. Reset an existing administrator's password only with `ADMIN_RESET_PASSWORD=true`, revoking that account's login sessions and preserving WhatsApp data. Normal restarts must not synchronize environment passwords. Keep destructive seed separate and never run it automatically in production.

## Architecture
- TypeScript/Hono service running on Bun and sharing the root package with the React frontend. `src/app.ts` builds the Hono app, composes routes, and starts the server.
- Routes are module-based under `src/modules/*` with `route.ts`, `controller.ts`, `service.ts`, `schema.ts`, and `types.ts` files.
- Admin, user, API session, WhatsApp, and webhook routes are all hosted by the same API process.
- Startup loads stored WhatsApp sessions before listening, then schedules cleanup/profile-picture jobs.
- Prisma uses PostgreSQL with `@prisma/adapter-pg`; generated client imports come from `@generated/prisma`, not `@prisma/client`.

## Data And Auth Gotchas
- `bun run db:seed` is destructive: `src/db/seed.ts` deletes all users and WhatsApp sessions before reseeding.
- Use Better Auth database-backed sessions for human login and its `admin` plugin for user management. Expose only the Better Auth endpoints used by the app; keep the allowed paths and methods explicit.
- Use Better Auth API keys for integrations, with explicit global or single-session permissions. Preserve key scope in HTTP/MCP/Socket.IO authorization and list/count queries; missing scope denies access. Session JWTs/signing secrets and rotation endpoints do not exist.

## Style And Editing
- Frontend and backend formatting/linting use the root Biome configuration copied from `car-store-template`.
- Use the latest Zod 4 release shared with the frontend; import from `zod`, not `zod/v3`. Use explicit key and value schemas for `z.record`.
- Biome enforces extensionful TS imports and `kebab-case` filenames.
- TS path aliases are defined in `tsconfig.json` (`@server/*`, `@controllers/*`, `@services/*`, etc.).
- Build the API image from the repository root using `bun run docker:build` and `docker/Dockerfile`.
- Built frontend routes live in `src/modules/frontend/route.ts`; register the module after API routes in `src/app.ts`. Use Hono's official `serveStatic` middleware. Keep API/admin/health misses and missing assets as 404 responses, not SPA HTML.
