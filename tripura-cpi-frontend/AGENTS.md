# PRIST Admin Dashboard

## Commands

- `npm run dev` — start dev server
- `npm run build` — typecheck + production build
- `npm run lint` — run ESLint
- `npm run preview` — preview production build

## Tech Stack

- **Framework**: React 19 + TypeScript, Vite 7
- **Styling**: Tailwind CSS v4, shadcn/ui (New York style, neutral palette)
- **Routing**: React Router v7 (`createBrowserRouter`)
- **State**: Zustand (with persist middleware for auth)
- **Server state**: TanStack React Query
- **Forms**: React Hook Form + Zod
- **Data grid**: AG Grid Community
- **Icons**: Lucide React
- **Toasts**: Sonner

## Project Structure

```
src/
  components/
    ui/          — shadcn/ui generated components (do NOT edit manually, use `npx shadcn@latest add <component>`)
    layout/      — app shell: AppLayout, AppSidebar, AppHeader
    wrappers/    — provider/wrapper components: QueryProvider, ProtectedRoute, DataGrid
  pages/         — route page components
  hooks/         — custom React hooks
  store/         — Zustand stores
  lib/           — utilities (axios instance, cn() helper)
  types/         — shared TypeScript types
  routes.tsx     — all route definitions
  App.tsx        — root component (providers + router + toaster)
  main.tsx       — entry point
  index.css      — Tailwind v4 imports + shadcn CSS variables (theme)
```

## Environment Variables

- Copy `.env.example` to `.env` and set values
- `VITE_API_BASE_URL` — backend API base URL (defaults to `/api` if not set)
- All env vars must be prefixed with `VITE_` to be exposed to client code
- Access via `import.meta.env.VITE_*`
- The axios instance in `src/lib/axios.ts` reads `VITE_API_BASE_URL` automatically

## Conventions

- Use `@/` path alias for all imports (maps to `src/`)
- File naming: kebab-case for all files (e.g. `auth-store.ts`, `app-sidebar.tsx`)
- Components: PascalCase named exports, one component per file
- Pages: default exports
- Hooks: `use-` prefix, camelCase function name (e.g. file `use-auth.ts`, export `useAuth`)
- Stores: `<name>-store.ts` with `use<Name>Store` export
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use the axios instance from `@/lib/axios` for all API calls (has JWT interceptor)
- Auth state lives in Zustand (`src/store/auth-store.ts`), accessed via `useAuth()` hook
- Protected routes wrap authenticated pages via `<ProtectedRoute />` in the router
- All shadcn theme variables are in `src/index.css` — do not remove them
- Data tables use the shared `<DataGrid>` wrapper (`src/components/wrappers/data-grid.tsx`). To remember a table's column layout per device (order, width, visibility, pinning, sort), pass a unique, stable `persistKey` (convention `section:table`, e.g. `master-data:markets`) — load/save/reset and the "Reset layout" button are automatic. Omit `persistKey` to disable persistence for that grid. State is stored in `localStorage` under `tcpi:grid-state:<persistKey>` via `src/hooks/use-grid-state-persistence.ts`
