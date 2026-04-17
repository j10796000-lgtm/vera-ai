# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI**: Anthropic (via Replit AI Integrations, no user API key needed)

## Artifacts

### Adit AI (`artifacts/adit-ai`)
- React + Vite frontend, preview at `/`
- Warm, human-feeling AI chat app powered by Claude
- Multi-conversation support (create, browse, delete)
- SSE streaming for real-time AI responses
- All conversations persisted in PostgreSQL

### API Server (`artifacts/api-server`)
- Express 5 backend, preview at `/api`
- Routes: `/api/anthropic/conversations` (CRUD + SSE messaging)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## DB Schema

- `conversations` — stores conversation metadata (id, title, createdAt)
- `messages` — stores messages per conversation (id, conversationId, role, content, createdAt)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
