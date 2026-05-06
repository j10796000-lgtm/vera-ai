# Vera

AI companion app — warm, 21+ conversation space powered by Claude, with mood tracking.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL`, `SESSION_SECRET`

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite (artifacts/adit-ai), TypeScript
- **Backend**: Express 5 (artifacts/api-server), esbuild bundle
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: Clerk (`@clerk/react`, `@clerk/express`)
- **AI**: Anthropic Claude via Replit AI Integrations (`@workspace/integrations-anthropic-ai`)
- **Image gen**: OpenAI gpt-image-1 via Replit AI Integrations (`@workspace/integrations-openai-ai-server`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (OpenAPI → React Query hooks + Zod schemas)

## Where things live

- `artifacts/adit-ai/src/App.tsx` — entire frontend (chat, mood tracker, paywall, auth)
- `artifacts/adit-ai/src/components/MoodTracker.tsx` — mood tracker component
- `artifacts/api-server/src/routes/` — API routes (anthropic, image, subscription)
- `lib/db/src/schema/` — Drizzle table definitions (conversations, messages, users)
- `lib/api-spec/` — OpenAPI spec; run codegen after changes

## Architecture decisions

- `userId` is stored on the `conversations` table (text, FK to Clerk user ID) — must be in Drizzle schema or queries generate blank-column SQL
- Clerk `authorizedParties` is populated from `REPLIT_DOMAINS` env var so production tokens validate correctly
- All `requireAuth` middleware wraps `getAuth()` in try/catch — Clerk can throw in production on missing `azp` claim
- Stripe integration wired but not connected; checkout/portal endpoints return graceful 503 when Stripe is absent — do not re-propose without user request
- Mood tracker data persists in `localStorage` under key `vera_mood_entries` (no backend needed)

## Product

- **Chat**: multi-conversation AI companion (Claude claude-opus-4-7), SSE streaming, file/image attachments
- **Mood tracker**: 8-mood wheel, optional note, history view with frequency chart — tab in main nav
- **Image generation**: 🎨 button in chat, OpenAI gpt-image-1
- **Freemium**: 10 free messages/day (localStorage), Pro plan at $9/month (Stripe, pending connection)
- **Auth**: Clerk, 21+ system prompt, dark serif aesthetic (Lora font, amber #c97b2a)

## Gotchas

- `lib/db` must be rebuilt (`cd lib/db && npx tsc --build`) before API server picks up schema changes
- Production DB `users` table was created via raw SQL (not drizzle-kit push) — schema file must match column names exactly
- Do not run `pnpm dev` at workspace root; use workflow restart instead
