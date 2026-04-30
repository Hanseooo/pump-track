# Modularity & Architecture Rules

> **Package Manager:** Use `pnpm` (see `pnpm-lock.yaml`). Run commands with `pnpm <command>` instead of `npm`.
> **Companion Doc:** See `AGENTS.md` for critical project-wide rules (policy tiers, forbidden patterns, Next.js 16 constraints).

To prevent technical debt and ensure the dashboard remains maintainable for future school demos or expansions, follow these architectural patterns.

## 1. Layered Architecture

The system is divided into three distinct layers. Code from one layer should only call the layer directly below it.

- **API Routes (`src/app/api/*`)**: Entry points. Responsible only for parsing the request, calling a Service, and returning a typed JSON response. **No business logic or DB queries here.**
- **Services (`src/lib/services/*`)**: The "Brain." Contains business logic (e.g., "should we water?", "clamping settings values"). Services coordinate between KV and Supabase.
- **Data Access**: Low-level drivers. For Redis, import `kv` from `@upstash/redis` directly; for Supabase, use the singleton client from `src/lib/supabase.ts`.

> **Note:** Current implementation in `docs/dev/BACKEND.md` shows routes with embedded business logic. This is a v1 simplification. New routes must follow the layered pattern per this document. When refactoring existing routes, extract logic into services incrementally rather than rewriting entire files.

## 2. Directory Structure

```
src/
├── app/
│   ├── api/       # API routes (thin controllers)
│   ├── page.tsx   # Dashboard UI
│   └── layout.tsx # Root layout
├── components/    # Reusable shadcn/ui and custom components
└── lib/
    ├── services/  # Business logic (irrigation-service.ts, settings-service.ts)
    ├── supabase.ts # Supabase client singleton
    ├── auth.ts    # API key validation
    ├── types.ts   # Centralized TypeScript interfaces
    └── utils.ts   # Small, pure helper functions
```

> **Current state:** The `services/` directory and `types.ts` may not exist yet. Create them when implementing new features or refactoring existing routes.

## 3. Key Modularity Rules

- **Logic Extraction**: If a logic block (like calculating if a pump should fire) is longer than 3 lines, it belongs in a Service.
- **Type Safety**: Never use `any`. Always use the shared types defined in `src/lib/types.ts`.
- **Single Responsibility**: An API route for `/api/reading` should not know how to write to Supabase; it should just call `IrrigationService.recordReading()`.
- **Configuration over Hardcoding**: Use the `DEFAULTS` constant in the settings service rather than hardcoding numbers like 40 (moisture threshold) inside UI components or API routes.
- **Naming Conventions**: Use kebab-case for service files (`irrigation-service.ts`, `settings-service.ts`). Use PascalCase for service objects/classes if you choose an OOP pattern.

## 4. Error Handling & API Responses

- Services should return `Result<T, Error>` or throw domain-specific errors. Never return `any`.
- API routes must **not** silently swallow errors. Always return a typed error response with an appropriate HTTP status code.
- Do not wrap entire API routes in `try/catch` blocks that hide error details. Catch specific errors and map them to structured responses.

## 5. Component Architecture

- **Server Components by default**: Use async Server Components for data fetching. Avoid `useEffect` + `fetch` in components when you can fetch directly in the server.
- **Client Components only when needed**: Add `'use client'` only when using `useState`, `useEffect`, event handlers, or browser APIs.
- **No `fetch` with `cache: 'force-cache'` in Server Components**: Next.js 16 defaults to dynamic. Do not add `cache: 'no-store'` unless there is a specific reason.
- **No `router.refresh()` after mutations**: In Server Components, use `revalidatePath` instead.
- **Client-side Supabase**: Do not import the server-side `supabase.ts` in client components. Create a browser-safe Supabase client if needed.

## 6. Import & Alias Rules

- Always use `@/` aliases for project imports (e.g., `@/lib/services/settings-service`).
- Import shadcn/ui components from `@/components/ui/`.
- Do not create new Supabase client instances; always import from `@/lib/supabase.ts`.

## 7. Example: Service Pattern

Instead of putting `kv.hset` directly in a route, use:

```typescript
// src/lib/services/settings-service.ts
import { kv } from '@upstash/redis';
import { Settings } from '@/lib/types';

export async function updateSettings(newSettings: Settings) {
  const validated = clampSettings(newSettings);
  return await kv.hset('settings', validated);
}
```